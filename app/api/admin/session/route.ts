import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validateTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try { return JSON.parse(userRaw) as { id: number; username?: string; first_name?: string }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!initData || !botToken || !url || !serviceKey) return NextResponse.json({ error: "ADMIN_CONFIG_ERROR" }, { status: 500 });
    const telegramUser = validateTelegramInitData(initData, botToken);
    if (!telegramUser) return NextResponse.json({ error: "INVALID_TELEGRAM_SESSION" }, { status: 401 });

    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: setting, error } = await supabase.from("settings").select("value").eq("key", "admin_telegram_id").maybeSingle();
    if (error) return NextResponse.json({ error: "ADMIN_LOOKUP_ERROR" }, { status: 500 });
    const adminId = Number(setting?.value ?? 0);
    if (!adminId || telegramUser.id !== adminId) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
    return NextResponse.json({ ok: true, display_name: telegramUser.username ? `@${telegramUser.username}` : telegramUser.first_name || "Admin" });
  } catch { return NextResponse.json({ error: "ADMIN_SESSION_ERROR" }, { status: 500 }); }
}
