import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://glkpxyanjsktmwkvvsxt.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CALLBACK_SECRET =
  process.env.ADS_GALAXY_REWARD_CALLBACK_SECRET ||
  process.env.ADS_GALAXY_CALLBACK_SECRET ||
  "";
const MINI_APP_ID = "92";
const MAX_CLOCK_SKEW_SECONDS = 300;

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ViewCash Ads Galaxy reward callback",
    event: "reward.eligible",
  });
}

export async function POST(req: Request) {
  try {
    if (!SERVICE_ROLE_KEY || !CALLBACK_SECRET) {
      console.error(
        "Ads Galaxy callback not configured: missing Supabase service key or callback secret",
      );
      return NextResponse.json(
        { error: "CALLBACK_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    // IMPORTANT: verify the exact raw body. Never JSON.parse/stringify before HMAC verification.
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-adsgalaxy-timestamp") || "";
    const headerEventId = req.headers.get("x-adsgalaxy-event-id") || "";
    const eventType = req.headers.get("x-adsgalaxy-event") || "";
    const signatureVersion =
      req.headers.get("x-adsgalaxy-signature-version") || "";
    const supplied = req.headers.get("x-adsgalaxy-signature") || "";
    const timestampNumber = Number(timestamp);

    if (
      !timestamp ||
      !headerEventId ||
      !supplied ||
      !Number.isFinite(timestampNumber) ||
      Math.abs(Date.now() / 1000 - timestampNumber) >
        MAX_CLOCK_SKEW_SECONDS
    ) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    if (eventType !== "reward.eligible") {
      return NextResponse.json(
        { error: "INVALID_EVENT_TYPE" },
        { status: 400 },
      );
    }

    if (signatureVersion && signatureVersion !== "v1") {
      return NextResponse.json(
        { error: "UNSUPPORTED_SIGNATURE_VERSION" },
        { status: 400 },
      );
    }

    const expected = crypto
      .createHmac("sha256", CALLBACK_SECRET)
      .update(timestamp + "." + headerEventId + "." + rawBody)
      .digest("hex");

    if (
      supplied.length !== expected.length ||
      !crypto.timingSafeEqual(
        Buffer.from(supplied, "utf8"),
        Buffer.from(expected, "utf8"),
      )
    ) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    let payload: {
      event_id?: string;
      request_id?: string;
      mini_app_id?: string | number;
      user_id?: string | number;
      status?: string;
      completed_at?: string;
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const eventId = String(payload?.event_id || "").trim();
    const requestId = String(payload?.request_id || eventId).trim();
    const telegramId = String(payload?.user_id || "").trim();

    if (
      !eventId ||
      eventId !== headerEventId ||
      !requestId ||
      !telegramId ||
      String(payload?.mini_app_id) !== MINI_APP_ID ||
      payload?.status !== "completed"
    ) {
      return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: user, error: userError } = await db
      .from("users")
      .select("id,status")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (userError) throw userError;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "USER_NOT_ELIGIBLE" }, { status: 403 });
    }

    const { data: limitSetting } = await db
      .from("settings")
      .select("value")
      .eq("key", "daily_ad_limit_adsgalaxy")
      .maybeSingle();

    const { data: rewardSetting } = await db
      .from("settings")
      .select("value")
      .eq("key", "ad_reward_mb")
      .maybeSingle();

    const limit = Number(limitSetting?.value?.count || 0);
    const rewardMb = Number(rewardSetting?.value?.amount || 0);

    if (!Number.isFinite(rewardMb) || rewardMb <= 0) {
      return NextResponse.json(
        { error: "REWARD_NOT_CONFIGURED" },
        { status: 500 },
      );
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { count } = await db
      .from("ad_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("provider", "adsgalaxy")
      .gte("created_at", start.toISOString());

    if (limit > 0 && (count || 0) >= limit) {
      return NextResponse.json(
        { error: "DAILY_AD_LIMIT_REACHED" },
        { status: 429 },
      );
    }

    // The RPC performs event-idempotency and credits the wallet atomically.
    const { data, error } = await db.rpc("credit_adsgalaxy_reward", {
      p_user_id: user.id,
      p_event_id: eventId,
      p_request_id: requestId,
      p_reward_mb: rewardMb,
    });

    if (error) throw error;

    if (!data?.ok) {
      return NextResponse.json(
        data || { error: "REWARD_NOT_CREDITED" },
        { status: 409 },
      );
    }

    console.log("Ads Galaxy reward processed", {
      eventId,
      requestId,
      telegramId,
      duplicate: !!data.duplicate,
      rewardMb: Number(data.reward_mb || 0),
    });

    return NextResponse.json({
      ok: true,
      duplicate: !!data.duplicate,
      reward_mb: Number(data.reward_mb || 0),
    });
  } catch (error) {
    console.error("Ads Galaxy callback error", error);
    return NextResponse.json(
      { error: "CALLBACK_PROCESSING_FAILED" },
      { status: 500 },
    );
  }
}
