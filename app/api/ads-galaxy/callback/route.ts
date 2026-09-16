import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://glkpxyanjsktmwkvvsxt.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CALLBACK_SECRET = process.env.ADS_GALAXY_REWARD_CALLBACK_SECRET || "";
const MINI_APP_ID = "92";

export async function GET() {
  return NextResponse.json({ ok: true, service: "ViewCash Ads Galaxy reward callback" });
}

export async function POST(req: Request) {
  try {
    if (!SERVICE_ROLE_KEY || !CALLBACK_SECRET) {
      console.error("Ads Galaxy callback not configured: missing server secret");
      return NextResponse.json({ error: "CALLBACK_NOT_CONFIGURED" }, { status: 503 });
    }

    const rawBody = await req.text();
    const timestamp = req.headers.get("x-adsgalaxy-timestamp") || "";
    const headerEventId = req.headers.get("x-adsgalaxy-event-id") || "";
    const eventType = req.headers.get("x-adsgalaxy-event") || "";
    const supplied = req.headers.get("x-adsgalaxy-signature") || "";
    const timestampNumber = Number(timestamp);

    if (!timestamp || !headerEventId || !supplied || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
      console.error("Ads Galaxy callback rejected: invalid or stale signature metadata");
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    const expected = crypto
      .createHmac("sha256", CALLBACK_SECRET)
      .update(timestamp + "." + headerEventId + "." + rawBody)
      .digest("hex");

    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      console.error("Ads Galaxy callback rejected: signature mismatch");
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    if (payload?.event_id !== headerEventId || payload?.status !== "completed" || String(payload?.mini_app_id) !== MINI_APP_ID) {
      console.error("Ads Galaxy callback rejected: invalid payload", { eventType, eventId: headerEventId, miniAppId: payload?.mini_app_id, status: payload?.status });
      return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
    }

    if (eventType && eventType !== "reward.eligible") {
      console.error("Ads Galaxy callback rejected: unexpected event type", { eventType });
      return NextResponse.json({ error: "INVALID_EVENT_TYPE" }, { status: 400 });
    }

    const telegramId = String(payload?.user_id || "").trim();
    const eventId = String(payload?.event_id || "").trim();
    const requestId = String(payload?.request_id || eventId).trim();
    if (!telegramId || !eventId) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await db
      .from("users")
      .select("id,status,activated,account_level")
      .eq("telegram_id", telegramId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user || user.status !== "active" || !user.activated) return NextResponse.json({ error: "USER_NOT_ELIGIBLE" }, { status: 403 });

    const { data: plan, error: planError } = await db
      .from("activation_levels")
      .select("daily_ad_limit,ad_reward_coins,active")
      .eq("level", user.account_level)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan || !plan.active) return NextResponse.json({ error: "PLAN_NOT_AVAILABLE" }, { status: 403 });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await db
      .from("ad_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", start.toISOString());
    const limit = Number(plan.daily_ad_limit || 0);
    if (limit > 0 && (count || 0) >= limit) return NextResponse.json({ error: "DAILY_AD_LIMIT_REACHED" }, { status: 429 });

    const rewardCoins = Number(plan.ad_reward_coins || 0);
    if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) return NextResponse.json({ error: "REWARD_NOT_CONFIGURED" }, { status: 500 });

    const { data, error } = await db.rpc("credit_adsgalaxy_reward", {
      p_user_id: user.id,
      p_event_id: eventId,
      p_request_id: requestId,
      p_reward_coins: rewardCoins,
    });
    if (error) throw error;
    if (!data?.ok) return NextResponse.json(data || { error: "REWARD_NOT_CREDITED" }, { status: 409 });

    console.log("Ads Galaxy reward processed", { eventId, requestId, telegramId, duplicate: !!data.duplicate, rewardCoins: Number(data.reward_coins || 0) });
    return NextResponse.json({ ok: true, duplicate: !!data.duplicate, reward_coins: Number(data.reward_coins || 0) });
  } catch (error) {
    console.error("Ads Galaxy callback error", error);
    return NextResponse.json({ error: "CALLBACK_PROCESSING_FAILED" }, { status: 500 });
  }
}
