import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { checkWithdrawalFraud } from "@/lib/fraud";

function validateTelegram(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => `${key}=${value}`).join("\n");
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

    const fraud = await checkWithdrawalFraud(user.id);
    if (!fraud.allowed) return NextResponse.json({ error: fraud.error }, { status: 429 });

    const { data, error } = await supabase.rpc("submit_withdrawal", {
      p_user_id: user.id,
      p_amount: amount,
      p_bank_name: bankName,
      p_account_name: accountName,
      p_account_number: accountNumber,
    });
    if (error) return NextResponse.json({ error: error.message === "INSUFFICIENT_BALANCE" ? "INSUFFICIENT_BALANCE" : "WITHDRAWAL_REQUEST_ERROR" }, { status: 400 });
    if (!data?.ok) {
      const code = String(data?.error || "WITHDRAWAL_REQUEST_ERROR");
      const status = code === "WITHDRAWAL_ALREADY_PENDING" ? 409 : code === "INSUFFICIENT_BALANCE" ? 400 : 400;
      return NextResponse.json({ error: code }, { status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "WITHDRAWAL_REQUEST_ERROR" }, { status: 500 });
  }
}
