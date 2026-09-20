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
    const sessionId = String(body?.session_id || "").trim();
    if (!tg?.id || !requestVar || !ymid || !sessionId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id,status").eq("telegram_id", tg.id).maybeSingle();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ELIGIBLE" }, { status: 403 });

    const { data, error } = await db.rpc("credit_daily_checkin_ad_completion", {
      p_user_id: user.id,
      p_session_id: sessionId,
      p_request_var: requestVar,
      p_ymid: ymid,
    });
    if (error) {
      console.error("ViewCash check-in ad reward error", error);
      return NextResponse.json({ error: "CHECKIN_CREDIT_FAILED" }, { status: 500 });
    }
    if (data?.ok) return NextResponse.json({ ok: true, duplicate: !!data.duplicate, reward_coins: Number(data.reward_coins || 0), streak_day: Number(data.streak_day || 1) });
    return NextResponse.json(data || { ok: false, error: "CHECKIN_NOT_CREDITED" }, { status: 409 });
  } catch (error) {
    console.error("ViewCash check-in ad completion error", error);
    return NextResponse.json({ error: "CHECKIN_COMPLETION_ERROR" }, { status: 500 });
  }
}
