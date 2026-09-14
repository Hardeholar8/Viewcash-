import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const VIEWCASH_SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

function validateInitData(initData: string, botToken: string) {
  if (!initData) throw new Error("TELEGRAM_INIT_DATA_MISSING");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_HASH_MISSING");
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error("TELEGRAM_HASH_INVALID");
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 86400) throw new Error("TELEGRAM_SESSION_EXPIRED");
  const userRaw = params.get("user");
  if (!userRaw) throw new Error("TELEGRAM_USER_MISSING");
  return JSON.parse(userRaw) as { id: number };
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !serviceRoleKey) throw new Error("VIEWCASH_SERVER_CONFIG_ERROR");

    const telegramUser = validateInitData(String(initData || ""), botToken);
    const supabase = createClient(VIEWCASH_SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await supabase.from("users").select("id").eq("telegram_id", telegramUser.id).maybeSingle();
    if (userError) throw new Error("Unable to find account.");
    if (!user) throw new Error("Account not found.");

    const { data, error } = await supabase.rpc("claim_daily_checkin", { p_user_id: user.id });
    if (error) throw new Error("Unable to process check-in.");
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.checked_in) {
      return NextResponse.json({ ok: true, checked_in: false, reward_coins: 0, streak_day: Number(result?.streak_day || 1), message: "You have already checked in today." });
    }
    return NextResponse.json({ ok: true, checked_in: true, reward_coins: Number(result.reward_coins || 0), streak_day: Number(result.streak_day || 1), message: `Daily check-in claimed: +${Number(result.reward_coins || 0).toLocaleString()} coins.` });
  } catch (error) {
    console.error("ViewCash check-in error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check-in failed." }, { status: 400 });
  }
}
