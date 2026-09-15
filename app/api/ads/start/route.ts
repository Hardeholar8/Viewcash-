import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";
const MONETAG_ZONE_ID = "11801942";
const SESSION_TTL_MS = 15 * 60 * 1000;
const BOT_TOKEN = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();

function getTelegramUser(initData: string) {
  const botToken = BOT_TOKEN();
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const rawUser = params.get("user");
  if (!rawUser) return null;
  try { return JSON.parse(rawUser) as { id?: number }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const tg = getTelegramUser(String(body?.initData || ""));
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!tg?.id) return NextResponse.json({ error: "INVALID_TELEGRAM_SESSION" }, { status: 401 });
    if (!serviceKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });

    const db = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user, error: userError } = await db.from("users").select("id,activated,status").eq("telegram_id", tg.id).maybeSingle();
    if (userError) return NextResponse.json({ error: "TEMPORARY_CONNECTION_PROBLEM" }, { status: 503 });
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });
    if (!user.activated) return NextResponse.json({ error: "ACCOUNT_ACTIVATION_REQUIRED" }, { status: 403 });

    const now = Date.now();
    await db.from("ad_sessions").update({ status: "expired", completed_at: new Date(now).toISOString() })
      .eq("user_id", user.id).eq("provider", "monetag").eq("status", "started")
      .lt("started_at", new Date(now - SESSION_TTL_MS).toISOString());

    const requestVar = `watch_ads_${now}_${crypto.randomBytes(12).toString("hex")}`;
    const ymid = `vc_${crypto.randomBytes(16).toString("hex")}`;
    const { data: inserted, error } = await db.from("ad_sessions").insert({
      user_id: user.id, provider: "monetag", zone_id: MONETAG_ZONE_ID,
      request_var: requestVar, ymid, status: "started",
    }).select("id").single();
    if (error || !inserted) return NextResponse.json({ error: "AD_SESSION_ERROR" }, { status: 500 });

    return NextResponse.json({ ok: true, session_id: inserted.id, request_var: requestVar, ymid, zone_id: MONETAG_ZONE_ID });
  } catch (error) {
    console.error("ViewCash ad start error", error);
    return NextResponse.json({ error: "AD_SESSION_ERROR" }, { status: 500 });
  }
}
