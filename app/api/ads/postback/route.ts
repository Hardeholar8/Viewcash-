import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";
const MONETAG_ZONE_ID = "11801942";
const SESSION_TTL_MINUTES = 15;
const MINIMUM_VIEW_SECONDS = 15;

export async function GET(req: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return new NextResponse("server_config_error", { status: 500 });

    const q = req.nextUrl.searchParams;
    const requestVar = String(q.get("request_var") || "").trim();
    const eventType = String(q.get("event_type") || "").trim().toLowerCase();
    const rewardEventType = String(q.get("reward_event_type") || "").trim().toLowerCase();
    const telegramId = String(q.get("telegram_id") || "").trim();
    const ymid = String(q.get("ymid") || "").trim();
    const zoneId = String(q.get("zone_id") || "").trim();
    const estimatedPrice = Number(q.get("estimated_price") || 0);

    if (!requestVar || !ymid) return new NextResponse("ignored", { status: 200 });
    if (zoneId && zoneId !== MONETAG_ZONE_ID) return new NextResponse("ignored", { status: 200 });
    if (eventType !== "impression" || rewardEventType !== "valued") return new NextResponse("ignored", { status: 200 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: session, error: sessionError } = await db
      .from("ad_sessions")
      .select("id,user_id,status,ymid,request_var,zone_id,started_at")
      .eq("request_var", requestVar)
      .eq("ymid", ymid)
      .eq("provider", "monetag")
      .maybeSingle();
    if (sessionError) return new NextResponse("database_error", { status: 500 });
    if (!session) return new NextResponse("ignored", { status: 200 });
    if (session.status === "completed") return new NextResponse("already_processed", { status: 200 });
    if (session.status !== "started") return new NextResponse("ignored", { status: 200 });
    if (session.zone_id && session.zone_id !== MONETAG_ZONE_ID) return new NextResponse("ignored", { status: 200 });

    const startedAt = new Date(session.started_at).getTime();
    const elapsedMs = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsedMs > SESSION_TTL_MINUTES * 60 * 1000) {
      await db.from("ad_sessions").update({ status: "expired", completed_at: new Date().toISOString() }).eq("id", session.id).eq("status", "started");
      return new NextResponse("expired", { status: 200 });
    }

    // Monetag can report a valued impression when the ad is closed. Never
    // credit that event unless the ViewCash ad session has been active for
    // the full required 15 seconds. Return a non-2xx response for an early
    // callback so the provider can retry the postback instead of losing the
    // reward permanently.
    if (elapsedMs < MINIMUM_VIEW_SECONDS * 1000) {
      return new NextResponse("ad_view_too_short", { status: 409 });
    }

    const { data: user, error: userError } = await db
      .from("users")
      .select("id,telegram_id,activated,status")
      .eq("id", session.user_id)
      .maybeSingle();
    if (userError) return new NextResponse("database_error", { status: 500 });
    if (!user || user.status !== "active" || !user.activated) return new NextResponse("ignored", { status: 200 });
    if (telegramId && telegramId !== String(user.telegram_id)) return new NextResponse("ignored", { status: 200 });

    const { data: setting, error: settingError } = await db
      .from("settings")
      .select("value")
      .eq("key", "ad_reward_coins")
      .maybeSingle();
    if (settingError) return new NextResponse("database_error", { status: 500 });

    const rewardCoins = Number((setting?.value as { amount?: number } | null)?.amount ?? 100);
    if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) return new NextResponse("reward_not_configured", { status: 500 });

    const eventKey = `monetag:${ymid}:impression:valued`;
    const { data, error } = await db.rpc("credit_monetag_reward", {
      p_user_id: user.id,
      p_session_id: session.id,
      p_event_key: eventKey,
      p_estimated_price: Number.isFinite(estimatedPrice) ? estimatedPrice : 0,
      p_reward_coins: rewardCoins,
    });
    if (error) return new NextResponse("reward_credit_failed", { status: 500 });
    if (data?.error === "USER_NOT_ELIGIBLE") return new NextResponse("ignored", { status: 200 });
    if (data?.ok) return new NextResponse(data.duplicate ? "already_processed" : "ok", { status: 200 });
    return new NextResponse("reward_credit_failed", { status: 500 });
  } catch (error) {
    console.error("ViewCash Monetag postback error", error);
    return new NextResponse("server_error", { status: 500 });
  }
}
