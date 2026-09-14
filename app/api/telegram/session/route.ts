import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validateInitData(initData: string, botToken: string) {
  if (!initData) throw new Error("TELEGRAM_INIT_DATA_MISSING");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_HASH_MISSING");

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken.trim())
    .digest();
  const calculated = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (
    calculated.length !== hash.length ||
    !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))
  ) {
    throw new Error("TELEGRAM_HASH_INVALID");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate) throw new Error("TELEGRAM_AUTH_DATE_MISSING");
  if (Date.now() / 1000 - authDate > 86400) {
    throw new Error("TELEGRAM_INIT_DATA_EXPIRED");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("TELEGRAM_USER_MISSING");

  try {
    return JSON.parse(userRaw) as {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  } catch {
    throw new Error("TELEGRAM_USER_INVALID");
  }
}

async function getConfiguredBot(token: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${token.trim()}/getMe`,
    { cache: "no-store" },
  );
  const result = await response.json();
  if (!result.ok) return null;
  return result.result as { id: number; username?: string; first_name?: string };
}

function publicError(error: unknown) {
  if (!(error instanceof Error)) return "VIEWCASH_CONNECTION_ERROR";
  const message = error.message;

  if (message.startsWith("TELEGRAM_")) return message;
  if (message === "ViewCash server is not fully configured") return "SERVER_CONFIG_ERROR";
  if (message.startsWith("SUPABASE_USER_LOOKUP:")) return "SUPABASE_USER_LOOKUP_ERROR";
  if (message.startsWith("SUPABASE_USER_CREATE:")) return "SUPABASE_USER_CREATE_ERROR";
  if (message.startsWith("SUPABASE_USER_UPDATE:")) return "SUPABASE_USER_UPDATE_ERROR";
  if (message.startsWith("SUPABASE_WALLET_CREATE:")) return "SUPABASE_WALLET_CREATE_ERROR";
  if (message.startsWith("SUPABASE_WALLET_LOOKUP:")) return "SUPABASE_WALLET_LOOKUP_ERROR";
  return "VIEWCASH_CONNECTION_ERROR";
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!botToken || !url || !serviceRoleKey) {
      throw new Error("ViewCash server is not fully configured");
    }

    let telegramUser;
    try {
      telegramUser = validateInitData(String(initData || ""), botToken);
    } catch (error) {
      if (error instanceof Error && error.message === "TELEGRAM_HASH_INVALID") {
        const bot = await getConfiguredBot(botToken);
        const botLabel = bot?.username ? `@${bot.username}` : bot?.first_name || "unknown bot";
        throw new Error(
          `TELEGRAM_HASH_INVALID_${botLabel}_${bot?.id ?? "unknown"}`,
        );
      }
      throw error;
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const referralCode = `VC${telegramUser.id.toString(36).toUpperCase()}`;

    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id,telegram_id,username,first_name,last_name,referral_code")
      .eq("telegram_id", telegramUser.id)
      .maybeSingle();

    if (existingError) throw new Error(`SUPABASE_USER_LOOKUP:${existingError.message}`);

    let user = existing;

    if (!user) {
      const { data, error } = await supabase
        .from("users")
        .insert({
          telegram_id: telegramUser.id,
          username: telegramUser.username ?? null,
          first_name: telegramUser.first_name ?? null,
          last_name: telegramUser.last_name ?? null,
          referral_code: referralCode,
        })
        .select("id,telegram_id,username,first_name,last_name,referral_code")
        .single();

      if (error) throw new Error(`SUPABASE_USER_CREATE:${error.message}`);
      user = data;

      const { error: walletError } = await supabase
        .from("wallets")
        .insert({ user_id: user.id });

      if (walletError) throw new Error(`SUPABASE_WALLET_CREATE:${walletError.message}`);
    } else {
      const { data, error } = await supabase
        .from("users")
        .update({
          username: telegramUser.username ?? null,
          first_name: telegramUser.first_name ?? null,
          last_name: telegramUser.last_name ?? null,
        })
        .eq("id", user.id)
        .select("id,telegram_id,username,first_name,last_name,referral_code")
        .single();

      if (error) throw new Error(`SUPABASE_USER_UPDATE:${error.message}`);
      user = data;
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance,referral_balance,total_earned,total_withdrawn")
      .eq("user_id", user.id)
      .single();

    if (walletError) throw new Error(`SUPABASE_WALLET_LOOKUP:${walletError.message}`);

    const displayName = user.username
      ? `@${user.username}`
      : user.first_name || "Telegram User";

    return NextResponse.json({
      ok: true,
      telegram_id: telegramUser.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      display_name: displayName,
      balance: wallet.balance ?? 0,
      referral_balance: wallet.referral_balance ?? 0,
    });
  } catch (error) {
    console.error("ViewCash Telegram session error", error);
    return NextResponse.json(
      { error: publicError(error) },
      { status: 401 },
    );
  }
}
