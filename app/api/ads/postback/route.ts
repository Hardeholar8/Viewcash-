import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

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
    const estimatedPrice = Number(q.get("estimated_price") || 0);
    if (!requestVar || !ymid) return new NextResponse("ignored", { status: 200 });
    if (eventType !== "impression" || rewardEventType !== "valued") return new NextResponse("ignored", { status: 200 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: session, error: sessionError } = await db.from("ad_sessions").select("id,user_id,status").eq("request_var", requestVar).eq("provider", "monetag").maybeSingle();
    if (sessionError || !session) return new NextResponse("session_not_found", { status: 404 });
    if (session.status === "completed") return new NextResponse("already_processed", { status: 200 });
    if (session.status !== "started") return new NextResponse("invalid_session", { status: 409 });

    const { data: user } = await db.from("users").select("id,telegram_id,activated,status").eq("id", session.user_id).maybeSingle();
    if (!user || user.status !== "active" || !user.activated) return new NextResponse("user_not_eligible", { status: 403 });
    if (telegramId && telegramId !== String(user.telegram_id)) return new NextResponse("telegram_mismatch", { status: 403 });

    const { data: setting } = await db.from("settings").select("value").eq("key", "ad_reward_coins").maybeSingle();
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
    if (data?.error === "USER_NOT_ELIGIBLE") return new NextResponse("user_not_eligible", { status: 403 });
    if (data?.ok) return new NextResponse(data.duplicate ? "already_processed" : "ok", { status: 200 });
    return new NextResponse("reward_credit_failed", { status: 500 });
  } catch (error) {
    console.error("ViewCash Monetag postback error", error);
    return new NextResponse("server_error", { status: 500 });
  }
}
