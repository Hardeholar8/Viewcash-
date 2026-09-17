import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";
const MONETAG_ZONE_ID = "11801942";

function getTelegramUser(initData: string) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const raw = params.get("user");
  if (!raw) return null;
  try { return JSON.parse(raw) as { id?: number }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tg = getTelegramUser(String(body?.initData || ""));
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!tg?.id) return NextResponse.json({ error: "INVALID_TELEGRAM_SESSION" }, { status: 401 });
    if (!serviceKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await db.from("users").select("id,status,activated").eq("telegram_id", tg.id).maybeSingle();
    if (userError) return NextResponse.json({ error: "TEMPORARY_CONNECTION_PROBLEM" }, { status: 503 });
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active" || !user.activated) return NextResponse.json({ error: "ACCOUNT_NOT_ELIGIBLE" }, { status: 403 });

    const { data: existing } = await db.from("daily_checkins").select("streak_day").eq("user_id", user.id).eq("checkin_date", new Date().toISOString().slice(0, 10)).maybeSingle();
    if (existing) return NextResponse.json({ error: "ALREADY_CHECKED_IN", streak_day: Number(existing.streak_day || 1) }, { status: 409 });

    const now = Date.now();
    const requestVar = `checkin_${now}_${crypto.randomBytes(12).toString("hex")}`;
    const ymid = `vc_checkin_${crypto.randomBytes(16).toString("hex")}`;
    const { data: inserted, error } = await db.from("ad_sessions").insert({ user_id: user.id, provider: "monetag_checkin", zone_id: MONETAG_ZONE_ID, request_var: requestVar, ymid, status: "started" }).select("id").single();
    if (error || !inserted) return NextResponse.json({ error: "CHECKIN_AD_SESSION_ERROR" }, { status: 500 });

    return NextResponse.json({ ok: true, session_id: inserted.id, request_var: requestVar, ymid, zone_id: MONETAG_ZONE_ID });
  } catch (error) {
    console.error("ViewCash check-in ad start error", error);
    return NextResponse.json({ error: "CHECKIN_AD_SESSION_ERROR" }, { status: 500 });
  }
}
