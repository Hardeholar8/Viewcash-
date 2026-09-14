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
    const { data: session, error: sessionError } = await db
      .from("ad_sessions")
      .select("id,user_id,status")
      .eq("request_var", requestVar)
      .eq("provider", "monetag")
      .maybeSingle();
    if (sessionError || !session) return new NextResponse("session_not_found", { status: 404 });
    if (session.status === "completed") return new NextResponse("already_processed", { status: 200 });
    if (session.status !== "started") return new NextResponse("invalid_session", { status: 409 });

    const { data: user } = await db.from("users").select("id,telegram_id,activated,status").eq("id", session.user_id).maybeSingle();
    if (!user || user.status !== "active" || !user.activated) return new NextResponse("user_not_eligible", { status: 403 });
    if (telegramId && telegramId !== String(user.telegram_id)) return new NextResponse("telegram_mismatch", { status: 403 });

    const eventKey = `monetag:${ymid}:impression:valued`;
    const { data: existing } = await db.from("ad_rewards").select("id").eq("event_key", eventKey).maybeSingle();
    if (existing) return new NextResponse("already_processed", { status: 200 });

    const { data: setting } = await db.from("settings").select("value").eq("key", "ad_reward_coins").maybeSingle();
    const rewardCoins = Math.max(0, Number((setting?.value as { amount?: number } | null)?.amount ?? 100));
    if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) return new NextResponse("reward_not_configured", { status: 500 });

    const { data: reward, error: rewardError } = await db.from("ad_rewards").insert({
      user_id: user.id,
      session_id: session.id,
      provider: "monetag",
      event_key: eventKey,
      reward_event_type: "valued",
      estimated_price: Number.isFinite(estimatedPrice) ? estimatedPrice : 0,
      reward_amount: rewardCoins,
    }).select("id").single();
    if (rewardError || !reward) {
      if (rewardError?.code === "23505") return new NextResponse("already_processed", { status: 200 });
      return new NextResponse("reward_insert_failed", { status: 500 });
    }

    const { data: wallet } = await db.from("wallets").select("coins,total_coins_earned").eq("user_id", user.id).maybeSingle();
    if (!wallet) return new NextResponse("wallet_not_found", { status: 500 });

    const { error: walletError } = await db.from("wallets").update({
      coins: Number(wallet.coins || 0) + rewardCoins,
      total_coins_earned: Number(wallet.total_coins_earned || 0) + rewardCoins,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (walletError) return new NextResponse("wallet_update_failed", { status: 500 });

    await db.from("transactions").insert({
      user_id: user.id,
      type: "ad_reward",
      amount: rewardCoins,
      balance_type: "main",
      reference: `ad_reward:${reward.id}`,
      description: "Monetag rewarded ad",
    });

    await db.from("ad_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", session.id);
    return new NextResponse("ok", { status: 200 });
  } catch (error) {
    console.error("ViewCash Monetag postback error", error);
    return new NextResponse("server_error", { status: 500 });
  }
}
