import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const KEYS = [
  "ad_reward", "ad_reward_coins", "daily_ad_limit", "ad_cooldown_seconds",
  "coin_cash_rate", "minimum_withdrawal", "minimum_withdrawal_coins",
  "activation_fee", "referral_reward", "referral_reward_coins", "referral_requires_activation",
  "task_reward_coins", "welcome_bonus_coins", "admin_telegram_id",
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
function bool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}
function first(raw: Record<string, unknown>, key: string) {
  const value = raw[key] as Record<string, unknown> | number | boolean | null | undefined;
  if (value !== null && typeof value === "object") return Object.values(value)[0];
  return value;
}

export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const { data, error } = await supabase.from("settings").select("key,value").in("key", KEYS);
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_ERROR" }, { status: 500 });
  const raw: Record<string, unknown> = {};
  for (const row of data || []) raw[row.key] = row.value;
  const n = (key: string, fallback: number) => num(first(raw, key), fallback);
  const b = (key: string, fallback: boolean) => bool(first(raw, key), fallback);
  return NextResponse.json({
    ad_reward: n("ad_reward", 0), ad_reward_coins: n("ad_reward_coins", 100),
    daily_ad_limit: n("daily_ad_limit", 20), ad_cooldown_seconds: n("ad_cooldown_seconds", 30),
    coin_cash_rate: { cash: n("coin_cash_rate_cash", 100), coins: n("coin_cash_rate_coins", 1000) },
    minimum_withdrawal: n("minimum_withdrawal", 1000), minimum_withdrawal_coins: n("minimum_withdrawal_coins", 10000),
    activation_fee: n("activation_fee", 1000), referral_reward: n("referral_reward", 0), referral_reward_coins: n("referral_reward_coins", 100),
    referral_requires_activation: b("referral_requires_activation", true), task_reward_coins: n("task_reward_coins", 0), welcome_bonus_coins: n("welcome_bonus_coins", 100),
    admin_telegram_id: n("admin_telegram_id", 7160561113),
    fraud_max_ads_per_minute: n("fraud_max_ads_per_minute", 3), fraud_max_tasks_per_minute: n("fraud_max_tasks_per_minute", 5), fraud_max_withdrawals_per_day: n("fraud_max_withdrawals_per_day", 2),
    fraud_auto_suspend_critical: b("fraud_auto_suspend_critical", true), fraud_block_duplicate_reward_events: b("fraud_block_duplicate_reward_events", true), fraud_flag_rapid_activity: b("fraud_flag_rapid_activity", true),
  });
}

export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const values = {
    ad_reward: num(body?.ad_reward, 0), ad_reward_coins: num(body?.ad_reward_coins, 100),
    daily_ad_limit: num(body?.daily_ad_limit, 20), ad_cooldown_seconds: num(body?.ad_cooldown_seconds, 30),
    coin_cash_rate_cash: num(body?.coin_cash_rate_cash, 100), coin_cash_rate_coins: num(body?.coin_cash_rate_coins, 1000),
    minimum_withdrawal: num(body?.minimum_withdrawal, 1000), minimum_withdrawal_coins: num(body?.minimum_withdrawal_coins, 10000),
    activation_fee: num(body?.activation_fee, 1000), referral_reward: num(body?.referral_reward, 0), referral_reward_coins: num(body?.referral_reward_coins, 100),
    referral_requires_activation: bool(body?.referral_requires_activation, true), task_reward_coins: num(body?.task_reward_coins, 0), welcome_bonus_coins: num(body?.welcome_bonus_coins, 100),
    admin_telegram_id: num(body?.admin_telegram_id, 7160561113),
    fraud_max_ads_per_minute: num(body?.fraud_max_ads_per_minute, 3), fraud_max_tasks_per_minute: num(body?.fraud_max_tasks_per_minute, 5), fraud_max_withdrawals_per_day: num(body?.fraud_max_withdrawals_per_day, 2),
    fraud_auto_suspend_critical: bool(body?.fraud_auto_suspend_critical, true), fraud_block_duplicate_reward_events: bool(body?.fraud_block_duplicate_reward_events, true), fraud_flag_rapid_activity: bool(body?.fraud_flag_rapid_activity, true),
  };
  const integerKeys = ["daily_ad_limit", "ad_cooldown_seconds", "coin_cash_rate_cash", "coin_cash_rate_coins", "minimum_withdrawal", "minimum_withdrawal_coins", "activation_fee", "referral_reward_coins", "task_reward_coins", "welcome_bonus_coins", "admin_telegram_id", "fraud_max_ads_per_minute", "fraud_max_tasks_per_minute", "fraud_max_withdrawals_per_day"] as const;
  if (Object.entries(values).some(([k, v]) => typeof v === "number" && v < 0) || integerKeys.some(k => !Number.isInteger(values[k])) || values.daily_ad_limit < 1 || values.coin_cash_rate_cash <= 0 || values.coin_cash_rate_coins <= 0 || values.admin_telegram_id <= 0 || values.fraud_max_ads_per_minute < 1 || values.fraud_max_tasks_per_minute < 1 || values.fraud_max_withdrawals_per_day < 1) return NextResponse.json({ error: "INVALID_SETTINGS" }, { status: 400 });

  const rows = [
    { key: "ad_reward", value: { amount: values.ad_reward } }, { key: "ad_reward_coins", value: { amount: values.ad_reward_coins } },
    { key: "daily_ad_limit", value: { count: values.daily_ad_limit } }, { key: "ad_cooldown_seconds", value: { seconds: values.ad_cooldown_seconds } },
    { key: "coin_cash_rate", value: { cash: values.coin_cash_rate_cash, coins: values.coin_cash_rate_coins } },
    { key: "minimum_withdrawal", value: { amount: values.minimum_withdrawal } }, { key: "minimum_withdrawal_coins", value: { amount: values.minimum_withdrawal_coins } },
    { key: "activation_fee", value: { amount: values.activation_fee } }, { key: "referral_reward", value: { amount: values.referral_reward } }, { key: "referral_reward_coins", value: { amount: values.referral_reward_coins } },
    { key: "referral_requires_activation", value: { value: values.referral_requires_activation } }, { key: "task_reward_coins", value: { amount: values.task_reward_coins } }, { key: "welcome_bonus_coins", value: { amount: values.welcome_bonus_coins } },
    { key: "admin_telegram_id", value: values.admin_telegram_id },
    { key: "fraud_max_ads_per_minute", value: { value: values.fraud_max_ads_per_minute } }, { key: "fraud_max_tasks_per_minute", value: { value: values.fraud_max_tasks_per_minute } }, { key: "fraud_max_withdrawals_per_day", value: { value: values.fraud_max_withdrawals_per_day } },
    { key: "fraud_auto_suspend_critical", value: { value: values.fraud_auto_suspend_critical } }, { key: "fraud_block_duplicate_reward_events", value: { value: values.fraud_block_duplicate_reward_events } }, { key: "fraud_flag_rapid_activity", value: { value: values.fraud_flag_rapid_activity } },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "ADMIN_SETTINGS_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
