import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

function telegramUser(initData: string, token: string) {
  const params = new URLSearchParams(initData || "");
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_SESSION_INVALID");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token.trim()).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error("TELEGRAM_SESSION_INVALID");
  const raw = params.get("user");
  if (!raw) throw new Error("TELEGRAM_USER_MISSING");
  return JSON.parse(raw) as { id: number };
}

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!token || !key) throw new Error("SERVER_CONFIG_ERROR");
    const tg = telegramUser(String(initData || ""), token);
    const db = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id,activated,status").eq("telegram_id", tg.id).single();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });
    if (user.activated) return NextResponse.json({ ok: true, activated: true });

    const { data: setting } = await db.from("settings").select("value").eq("key", "welcome_bonus_coins").maybeSingle();
    const welcomeCoins = Number((setting?.value as { amount?: number } | null)?.amount || 0);
    const { error } = await db.from("users").update({ activated: true }).eq("id", user.id).eq("activated", false);
    if (error) throw error;

    if (welcomeCoins > 0) {
      const { data: wallet } = await db.from("wallets").select("coins,total_coins_earned").eq("user_id", user.id).single();
      if (wallet) {
        await db.from("wallets").update({ coins: Number(wallet.coins || 0) + welcomeCoins, total_coins_earned: Number(wallet.total_coins_earned || 0) + welcomeCoins }).eq("user_id", user.id);
      }
    }
    return NextResponse.json({ ok: true, activated: true });
  } catch (error) {
    console.error("ViewCash activation error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "ACTIVATION_FAILED" }, { status: 500 });
  }
}
