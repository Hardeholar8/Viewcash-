import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validateTelegram(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try { return JSON.parse(userRaw) as { id?: number }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const initData = String(body?.initData || "");
    const bankName = String(body?.bank_name || "").trim();
    const accountName = String(body?.account_name || "").trim();
    const accountNumber = String(body?.account_number || "").trim();
    const amount = Number(body?.amount);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !supabaseUrl || !serviceKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
    const telegramUser = validateTelegram(initData, botToken);
    if (!telegramUser?.id) return NextResponse.json({ error: "INVALID_TELEGRAM_SESSION" }, { status: 401 });
    if (!bankName || !accountName || !/^\d{10}$/.test(accountNumber)) return NextResponse.json({ error: "INVALID_BANK_DETAILS" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await supabase.from("users").select("id,status").eq("telegram_id", telegramUser.id).maybeSingle();
    if (userError) return NextResponse.json({ error: "USER_LOOKUP_ERROR" }, { status: 500 });
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });

    const { data: setting } = await supabase.from("settings").select("value").eq("key", "minimum_withdrawal").maybeSingle();
    const minimum = Number(setting?.value ?? 1000);
    if (!Number.isFinite(minimum)) return NextResponse.json({ error: "WITHDRAWAL_SETTINGS_ERROR" }, { status: 500 });
    if (amount < minimum) return NextResponse.json({ error: `MINIMUM_WITHDRAWAL:${minimum}` }, { status: 400 });

    const { data: wallet, error: walletError } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    if (walletError) return NextResponse.json({ error: "WALLET_LOOKUP_ERROR" }, { status: 500 });
    if (!wallet || Number(wallet.balance) < amount) return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });

    const { data: existing } = await supabase.from("withdrawals").select("id").eq("user_id", user.id).in("status", ["pending", "approved"]).limit(1);
    if (existing?.length) return NextResponse.json({ error: "WITHDRAWAL_ALREADY_PENDING" }, { status: 400 });

    const { data: withdrawal, error: withdrawalError } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      status: "pending"
    }).select("id,amount,bank_name,account_name,account_number,status,created_at").single();
    if (withdrawalError) return NextResponse.json({ error: "WITHDRAWAL_CREATE_ERROR" }, { status: 500 });
    return NextResponse.json({ ok: true, withdrawal });
  } catch {
    return NextResponse.json({ error: "WITHDRAWAL_REQUEST_ERROR" }, { status: 500 });
  }
}
