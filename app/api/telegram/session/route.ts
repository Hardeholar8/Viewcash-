import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const VIEWCASH_SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";
const BOT_USERNAME = "Viewcashe_bot";

function validateInitData(initData: string, botToken: string) {
  if (!initData) throw new Error("TELEGRAM_INIT_DATA_MISSING");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_HASH_MISSING");
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error("TELEGRAM_HASH_INVALID");
  const authDate = Number(params.get("auth_date"));
  if (!authDate) throw new Error("TELEGRAM_AUTH_DATE_MISSING");
  if (Date.now() / 1000 - authDate > 86400) throw new Error("TELEGRAM_SESSION_EXPIRED");
  const userRaw = params.get("user");
  if (!userRaw) throw new Error("TELEGRAM_USER_MISSING");
  try { return { user: JSON.parse(userRaw) as { id: number; username?: string; first_name?: string; last_name?: string }, startParam: params.get("start_param") || "" }; }
  catch { throw new Error("TELEGRAM_USER_INVALID"); }
}

function supabaseError(prefix: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  const message = (error?.message || "NO_MESSAGE").replace(/[\r\n]+/g, " ");
  if (/gateway timeout|bad gateway|service unavailable|failed to get project config|timeout|timed out|fetch failed|network|502|503|504/i.test(message)) return `${prefix}:TEMPORARY_DATABASE_ERROR`;
  return `${prefix}:${error?.code || "NO_CODE"}:${message.slice(0, 140)}`;
}

const isTransient = (message: string) => /gateway timeout|bad gateway|service unavailable|failed to get project config|timeout|timed out|fetch failed|network|502|503|504/i.test(message);

async function lookupUser(supabase: any, telegramId: number): Promise<any> {
  let lastError: { code?: string; message?: string; details?: string; hint?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await supabase.from("users").select("id,telegram_id,username,first_name,last_name,referral_code,activated,account_level").eq("telegram_id", telegramId).maybeSingle();
    if (!result.error) return result.data;
    lastError = result.error;
    if (!isTransient(result.error.message || "")) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error(supabaseError("SUPABASE_USER_LOOKUP_ERROR", lastError));
}

async function lookupWallet(supabase: any, userId: string): Promise<any> {
  let lastError: { code?: string; message?: string; details?: string; hint?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await supabase.from("wallets").select("coins,referral_balance,total_earned,total_withdrawn").eq("user_id", userId).maybeSingle();
    if (!result.error && result.data) return result.data;
    lastError = result.error || { code: "WALLET_NOT_FOUND", message: "Wallet not found" };
    if (!result.error || !isTransient(result.error.message || "")) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error(supabaseError("SUPABASE_WALLET_LOOKUP_ERROR", lastError));
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !serviceRoleKey) throw new Error("VIEWCASH_SERVER_CONFIG_ERROR");
    const { user: telegramUser, startParam } = validateInitData(String(initData || ""), botToken);
    const supabase = createClient(VIEWCASH_SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const referralCode = `VC${telegramUser.id.toString(36).toUpperCase()}`;
    let user: any = await lookupUser(supabase, telegramUser.id);
    let isNew = false;
    if (!user) {
      isNew = true;
      let referredBy: string | null = null;
      if (startParam) {
        const { data: referrer } = await supabase.from("users").select("id").eq("referral_code", startParam).maybeSingle();
        if (referrer?.id) referredBy = referrer.id;
      }
      const { data, error } = await supabase.from("users").insert({ telegram_id: telegramUser.id, username: telegramUser.username ?? null, first_name: telegramUser.first_name ?? null, last_name: telegramUser.last_name ?? null, referral_code: referralCode, referred_by: referredBy }).select("id,telegram_id,username,first_name,last_name,referral_code,activated,account_level").single();
      if (error) throw new Error(supabaseError("SUPABASE_USER_CREATE_ERROR", error));
      user = data;
      const { error: walletError } = await supabase.from("wallets").insert({ user_id: user.id });
      if (walletError) throw new Error(supabaseError("SUPABASE_WALLET_CREATE_ERROR", walletError));
      const { data: setting } = await supabase.from("settings").select("value").eq("key", "welcome_bonus_coins").maybeSingle();
      const welcomeCoins = Number((setting?.value as { amount?: number } | null)?.amount || 0);
      if (welcomeCoins > 0) {
        const reference = `welcome:${user.id}`;
        const { error: txError } = await supabase.from("transactions").insert({ user_id: user.id, type: "adjustment", amount: welcomeCoins, balance_type: "main", reference, description: "Welcome bonus coins" });
        if (!txError) await supabase.from("wallets").update({ coins: welcomeCoins, total_coins_earned: welcomeCoins }).eq("user_id", user.id);
      }
      if (referredBy) await supabase.from("referrals").insert({ referrer_id: referredBy, referred_user_id: user.id, reward_amount: 0, status: "pending" });
    }
    const wallet = await lookupWallet(supabase, user.id);
    let plan: any = null;
    if (user.account_level) {
      const { data: level } = await supabase.from("activation_levels").select("level,name,daily_earning_cap,activation_fee,task_min_withdrawal,affiliate_min_withdrawal").eq("level", user.account_level).maybeSingle();
      plan = level || null;
    }
    const { data: rateSetting } = await supabase.from("settings").select("value").eq("key", "coin_cash_rate").maybeSingle();
    const rateCoins_unused = Number((rateSetting?.value as { coins?: number } | null)?.coins || 1000);
    const rateCash_unused = Number((rateSetting?.value as { cash?: number } | null)?.cash || 100);
    const taskMinimumCash = Number(plan?.task_min_withdrawal || 0);
    const affiliateMinimum = Number(plan?.affiliate_min_withdrawal || 0);
    
    const [{ count: referredCount }, { count: activatedReferralCount }] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }).eq("referred_by", user.id),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("referred_by", user.id).eq("activated", true)
    ]);
    const displayName = user.username ? `@${user.username}` : user.first_name || "Telegram User";
    const referralLink = `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(user.referral_code)}`;
    const dataBalanceMb = Number(wallet.coins ?? 0); const referralDataMb = Number(wallet.referral_balance ?? 0);
    return NextResponse.json({ ok: true, telegram_id: telegramUser.id, username: user.username, first_name: user.first_name, last_name: user.last_name, display_name: displayName, activated: Boolean(user.activated), account_level: user.account_level ?? null, plan: plan ? { name: plan.name, daily_earning_cap: Number(plan.daily_earning_cap ?? 0), activation_fee: Number(plan.activation_fee ?? 0) } : null, redemption_minimums: { task_mb: 100, referral_mb: 100 }, referral_code: user.referral_code, referral_link: referralLink, referred_count: Number(referredCount || 0), activated_referral_count: Number(activatedReferralCount || 0), balance_mb: dataBalanceMb, referral_balance_mb: referralDataMb, total_earned_mb: Number(wallet.total_earned ?? 0), total_redeemed_mb: Number(wallet.total_withdrawn ?? 0), new_user: isNew });
  } catch (error) {
    console.error("ViewCash Telegram session error", error);
    const message = error instanceof Error ? error.message : "VIEWCASH_SESSION_ERROR";
    const safeMessage = message.includes(":TEMPORARY_DATABASE_ERROR") ? "Temporary connection problem. Please try again." : message;
    return NextResponse.json({ error: safeMessage }, { status: 401 });
  }
}
