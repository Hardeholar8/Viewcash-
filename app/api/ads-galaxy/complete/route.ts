import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://glkpxyanjsktmwkvvsxt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function validateTelegram(initData: string) {
  if (!TELEGRAM_BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TELEGRAM_BOT_TOKEN.trim()).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  try { return JSON.parse(params.get("user") || "{}").id as number | undefined; } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const telegramId = validateTelegram(String(body?.initData || ""));
    const requestId = String(body?.request_id || "").trim();
    if (!telegramId || !requestId || !SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: false, error: "INVALID_REQUEST" }, { status: 400 });

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await db.from("users").select("id,status,activated").eq("telegram_id", telegramId).maybeSingle();
    if (userError) throw userError;
    if (!user || user.status !== "active" || !user.activated) return NextResponse.json({ ok: false, error: "ACCOUNT_NOT_ELIGIBLE" }, { status: 403 });

    const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "ad_reward_coins").maybeSingle();
    if (settingError) throw settingError;
    const raw = setting?.value as { amount?: number } | number | null;
    const rewardCoins = typeof raw === "number" ? raw : Number(raw?.amount ?? 100);
    if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) return NextResponse.json({ ok: false, error: "REWARD_NOT_CONFIGURED" }, { status: 500 });

    const { data, error } = await db.rpc("credit_adsgalaxy_reward", { p_user_id: user.id, p_request_id: requestId, p_reward_coins: rewardCoins });
    if (error) throw error;
    if (!data?.ok) return NextResponse.json(data || { ok: false, error: "REWARD_NOT_CREDITED" }, { status: 409 });
    return NextResponse.json({ ok: true, duplicate: !!data.duplicate, reward_coins: Number(data.reward_coins || 0) });
  } catch (error) {
    console.error("Ads Galaxy reward error", error);
    return NextResponse.json({ ok: false, error: "REWARD_CREDIT_FAILED" }, { status: 500 });
  }
}
