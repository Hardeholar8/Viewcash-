import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://glkpxyanjsktmwkvvsxt.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CALLBACK_SECRET = process.env.ADS_GALAXY_REWARD_CALLBACK_SECRET || "";

export async function POST(req: Request) {
  try {
    if (!SERVICE_ROLE_KEY || !CALLBACK_SECRET) return NextResponse.json({ error: "CALLBACK_NOT_CONFIGURED" }, { status: 503 });
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-adsgalaxy-timestamp") || "";
    const headerEventId = req.headers.get("x-adsgalaxy-event-id") || "";
    const supplied = req.headers.get("x-adsgalaxy-signature") || "";
    const timestampNumber = Number(timestamp);
    if (!timestamp || !headerEventId || !supplied || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const expected = crypto.createHmac("sha256", CALLBACK_SECRET).update(timestamp + "." + headerEventId + "." + rawBody).digest("hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    if (payload?.event_id !== headerEventId || payload?.status !== "completed" || String(payload?.mini_app_id) !== "92") {
      return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
    }

    const telegramId = String(payload?.user_id || "").trim();
    const eventId = String(payload?.event_id || "").trim();
    // request_id is optional in the signed callback. Use event_id as the transaction reference
    // when Ads Galaxy does not include request_id, while preserving request_id when supplied.
    const requestId = String(payload?.request_id || eventId).trim();
    if (!telegramId || !eventId) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await db.from("users").select("id,status,activated").eq("telegram_id", telegramId).maybeSingle();
    if (userError) throw userError;
    if (!user || user.status !== "active" || !user.activated) return NextResponse.json({ error: "USER_NOT_ELIGIBLE" }, { status: 403 });

    const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "ad_reward_coins").maybeSingle();
    if (settingError) throw settingError;
    const raw = setting?.value as { amount?: number } | number | null;
    const rewardCoins = typeof raw === "number" ? raw : Number(raw?.amount ?? 100);
    const { data, error } = await db.rpc("credit_adsgalaxy_reward", {
      p_user_id: user.id,
      p_event_id: eventId,
      p_request_id: requestId,
      p_reward_coins: rewardCoins,
    });
    if (error) throw error;
    if (!data?.ok) return NextResponse.json(data || { error: "REWARD_NOT_CREDITED" }, { status: 409 });
    return NextResponse.json({ ok: true, duplicate: !!data.duplicate, reward_coins: Number(data.reward_coins || 0) });
  } catch (error) {
    console.error("Ads Galaxy callback error", error);
    return NextResponse.json({ error: "CALLBACK_PROCESSING_FAILED" }, { status: 500 });
  }
}
