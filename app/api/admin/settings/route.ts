import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const KEYS = [
  "ad_reward", "daily_ad_limit", "ad_cooldown_seconds",
  "fraud_max_ads_per_minute", "fraud_max_tasks_per_minute", "fraud_max_withdrawals_per_day",
  "fraud_auto_suspend_critical", "fraud_block_duplicate_reward_events", "fraud_flag_rapid_activity",
];

function adminOk(req: NextRequest, secret: string) {
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [id, timestamp, signature] = parts;
  const payload = `${id}.${timestamp}`;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(timestamp) || !Number.isFinite(age) || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function db(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !adminOk(req, key)) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const { data, error } = await supabase.from("settings").select("key,value").in("key", KEYS);
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_ERROR" }, { status: 500 });

  const raw: Record<string, unknown> = {};
  for (const row of data || []) raw[row.key] = row.value;
  const getNum = (key: string, fallback: number) => {
    const value = raw[key] as Record<string, unknown> | number | null;
    if (typeof value === "number") return value;
    return num(value && typeof value === "object" ? Object.values(value)[0] : value, fallback);
  };
  const getBool = (key: string, fallback: boolean) => {
    const value = raw[key] as Record<string, unknown> | boolean | null;
    if (typeof value === "boolean") return value;
    const first = value && typeof value === "object" ? Object.values(value)[0] : value;
    return typeof first === "boolean" ? first : fallback;
  };

  return NextResponse.json({
    ad_reward: getNum("ad_reward", 0),
    daily_ad_limit: getNum("daily_ad_limit", 20),
    ad_cooldown_seconds: getNum("ad_cooldown_seconds", 30),
    fraud_max_ads_per_minute: getNum("fraud_max_ads_per_minute", 3),
    fraud_max_tasks_per_minute: getNum("fraud_max_tasks_per_minute", 5),
    fraud_max_withdrawals_per_day: getNum("fraud_max_withdrawals_per_day", 2),
    fraud_auto_suspend_critical: getBool("fraud_auto_suspend_critical", true),
    fraud_block_duplicate_reward_events: getBool("fraud_block_duplicate_reward_events", true),
    fraud_flag_rapid_activity: getBool("fraud_flag_rapid_activity", true),
  });
}

export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const values = {
    ad_reward: num(body?.ad_reward, 0),
    daily_ad_limit: num(body?.daily_ad_limit, 20),
    ad_cooldown_seconds: num(body?.ad_cooldown_seconds, 30),
    fraud_max_ads_per_minute: num(body?.fraud_max_ads_per_minute, 3),
    fraud_max_tasks_per_minute: num(body?.fraud_max_tasks_per_minute, 5),
    fraud_max_withdrawals_per_day: num(body?.fraud_max_withdrawals_per_day, 2),
    fraud_auto_suspend_critical: Boolean(body?.fraud_auto_suspend_critical),
    fraud_block_duplicate_reward_events: Boolean(body?.fraud_block_duplicate_reward_events),
    fraud_flag_rapid_activity: Boolean(body?.fraud_flag_rapid_activity),
  };
  if (values.ad_reward < 0 || values.daily_ad_limit < 1 || !Number.isInteger(values.daily_ad_limit) || values.ad_cooldown_seconds < 0 || !Number.isInteger(values.ad_cooldown_seconds) || values.fraud_max_ads_per_minute < 1 || !Number.isInteger(values.fraud_max_ads_per_minute) || values.fraud_max_tasks_per_minute < 1 || !Number.isInteger(values.fraud_max_tasks_per_minute) || values.fraud_max_withdrawals_per_day < 1 || !Number.isInteger(values.fraud_max_withdrawals_per_day)) return NextResponse.json({ error: "INVALID_SETTINGS" }, { status: 400 });

  const rows = [
    { key: "ad_reward", value: { amount: values.ad_reward } },
    { key: "daily_ad_limit", value: { count: values.daily_ad_limit } },
    { key: "ad_cooldown_seconds", value: { seconds: values.ad_cooldown_seconds } },
    { key: "fraud_max_ads_per_minute", value: { value: values.fraud_max_ads_per_minute } },
    { key: "fraud_max_tasks_per_minute", value: { value: values.fraud_max_tasks_per_minute } },
    { key: "fraud_max_withdrawals_per_day", value: { value: values.fraud_max_withdrawals_per_day } },
    { key: "fraud_auto_suspend_critical", value: { value: values.fraud_auto_suspend_critical } },
    { key: "fraud_block_duplicate_reward_events", value: { value: values.fraud_block_duplicate_reward_events } },
    { key: "fraud_flag_rapid_activity", value: { value: values.fraud_flag_rapid_activity } },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
