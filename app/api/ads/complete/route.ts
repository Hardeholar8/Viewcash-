import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

function validateTelegram(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const raw = params.get("user");
  if (!raw) return null;
  try { return JSON.parse(raw) as { id?: number }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !serviceKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });

    const tg = validateTelegram(String(body?.initData || ""), botToken);
    const requestVar = String(body?.request_var || "").trim();
    const ymid = String(body?.ymid || "").trim();
    if (!tg?.id || !requestVar || !ymid) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id,status,activated").eq("telegram_id", tg.id).maybeSingle();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active" || !user.activated) return NextResponse.json({ error: "ACCOUNT_NOT_ELIGIBLE" }, { status: 403 });

    const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "ad_reward_coins").maybeSingle();
    if (settingError) return NextResponse.json({ error: "DATABASE_ERROR" }, { status: 500 });
    const rewardCoins = Number((setting?.value as { amount?: number } | null)?.amount ?? 100);
    if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) return NextResponse.json({ error: "REWARD_NOT_CONFIGURED" }, { status: 500 });

    const { data, error } = await db.rpc("credit_monetag_view_completion", {
      p_user_id: user.id,
      p_session_id: String(body?.session_id || ""),
      p_request_var: requestVar,
      p_ymid: ymid,
      p_reward_coins: rewardCoins,
    });
    if (error) {
      console.error("ViewCash immediate ad reward error", error);
      return NextResponse.json({ error: "REWARD_CREDIT_FAILED" }, { status: 500 });
    }

    if (data?.ok) return NextResponse.json({ ok: true, duplicate: !!data.duplicate, reward_coins: Number(data.reward_coins || 0) });
    return NextResponse.json(data || { ok: false, error: "REWARD_NOT_CREDITED" }, { status: 409 });
  } catch (error) {
    console.error("ViewCash ad completion error", error);
    return NextResponse.json({ error: "AD_COMPLETION_ERROR" }, { status: 500 });
  }
}
