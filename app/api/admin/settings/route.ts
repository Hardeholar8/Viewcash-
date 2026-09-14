import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function adminOk(req: NextRequest, secret: string) {
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [id, timestamp, signature] = parts;
  const payload = `${id}.${timestamp}`;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !Number.isFinite(age) || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !adminOk(req, key)) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.from("settings").select("key,value").in("key", ["ad_reward", "daily_ad_limit", "ad_cooldown_seconds"]);
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_ERROR" }, { status: 500 });
  const values: Record<string, number> = {};
  for (const row of data || []) {
    const value = row.value as Record<string, unknown>;
    values[row.key] = Number(value?.amount ?? value?.count ?? value?.seconds ?? 0);
  }
  return NextResponse.json({ ad_reward: values.ad_reward ?? 0, daily_ad_limit: values.daily_ad_limit ?? 20, ad_cooldown_seconds: values.ad_cooldown_seconds ?? 30 });
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !adminOk(req, key)) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const adReward = Number(body?.ad_reward);
  const dailyLimit = Number(body?.daily_ad_limit);
  const cooldown = Number(body?.ad_cooldown_seconds);
  if (!Number.isFinite(adReward) || adReward < 0 || !Number.isFinite(dailyLimit) || dailyLimit < 1 || !Number.isInteger(dailyLimit) || !Number.isFinite(cooldown) || cooldown < 0 || !Number.isInteger(cooldown)) return NextResponse.json({ error: "INVALID_AD_SETTINGS" }, { status: 400 });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const rows = [
    { key: "ad_reward", value: { amount: adReward } },
    { key: "daily_ad_limit", value: { count: dailyLimit } },
    { key: "ad_cooldown_seconds", value: { seconds: cooldown } },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
