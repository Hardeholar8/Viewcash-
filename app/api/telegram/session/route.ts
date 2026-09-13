import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validateInitData(initData: string, botToken: string) {
  if (!initData) throw new Error("Telegram initData is empty");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram initData has no hash");
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = crypto.createHmac("sha256", botToken).update("WebAppData").digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error("Telegram initData hash is invalid");
  const authDate = Number(params.get("auth_date"));
  if (!authDate) throw new Error("Telegram initData has no auth_date");
  if (Date.now() / 1000 - authDate > 86400) throw new Error("Telegram initData has expired");
  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Telegram initData has no user");
  try { return JSON.parse(userRaw) as { id: number; username?: string; first_name?: string; last_name?: string }; }
  catch { throw new Error("Telegram user data is invalid"); }
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !url || !serviceRoleKey) return NextResponse.json({ error: "ViewCash server is not fully configured" }, { status: 500 });

    const telegramUser = validateInitData(String(initData || ""), botToken);
    const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const referralCode = `VC${telegramUser.id.toString(36).toUpperCase()}`;
    const { data: existing, error: existingError } = await supabase.from("users").select("id,telegram_id,username,first_name,last_name,referral_code").eq("telegram_id", telegramUser.id).maybeSingle();
    if (existingError) throw existingError;
    let user = existing;
    if (!user) {
      const { data, error } = await supabase.from("users").insert({ telegram_id: telegramUser.id, username: telegramUser.username ?? null, first_name: telegramUser.first_name ?? null, last_name: telegramUser.last_name ?? null, referral_code: referralCode }).select("id,telegram_id,username,first_name,last_name,referral_code").single();
      if (error) throw error;
      user = data;
      const { error: walletInsertError } = await supabase.from("wallets").insert({ user_id: user.id });
      if (walletInsertError) throw walletInsertError;
    } else {
      const { data, error } = await supabase.from("users").update({ username: telegramUser.username ?? null, first_name: telegramUser.first_name ?? null, last_name: telegramUser.last_name ?? null }).eq("id", user.id).select("id,telegram_id,username,first_name,last_name,referral_code").single();
      if (error) throw error;
      user = data;
    }
    const { data: wallet, error: walletError } = await supabase.from("wallets").select("balance,referral_balance,total_earned,total_withdrawn").eq("user_id", user.id).single();
    if (walletError) throw walletError;
    const displayName = user.username ? `@${user.username}` : user.first_name || "Telegram User";
    return NextResponse.json({ ok: true, telegram_id: telegramUser.id, username: user.username, first_name: user.first_name, last_name: user.last_name, display_name: displayName, balance: wallet.balance ?? 0, referral_balance: wallet.referral_balance ?? 0 });
  } catch (error) {
    console.error("ViewCash Telegram session error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to connect ViewCash account" }, { status: 401 });
  }
}
