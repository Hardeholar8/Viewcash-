import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

type ActivationLevel = {
  level: number;
  name: string;
  activation_fee: number;
  active: boolean;
};

function telegramUser(initData: string, token: string) {
  const p = new URLSearchParams(initData || "");
  const h = p.get("hash");
  if (!h) throw new Error("TELEGRAM_SESSION_INVALID");
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token.trim()).digest();
  const calc = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calc.length !== h.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(h))) throw new Error("TELEGRAM_SESSION_INVALID");
  const raw = p.get("user");
  if (!raw) throw new Error("TELEGRAM_USER_MISSING");
  return JSON.parse(raw) as { id: number };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, email, account_level } = body;
    const selectedLevel = Number(account_level);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const flutterwaveSecret = (process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || process.env.SECRET_KEY || "").trim();
    if (!token || !key) throw new Error("SERVER_CONFIG_ERROR");
    if (!flutterwaveSecret) throw new Error("FLUTTERWAVE_NOT_CONFIGURED");
    if (!Number.isInteger(selectedLevel)) return NextResponse.json({ error: "SELECT_ACTIVATION_LEVEL" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    const tg = telegramUser(String(initData || ""), token);
    const db = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id,status,activated,account_level").eq("telegram_id", tg.id).single();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });
    if (user.activated) return NextResponse.json({ error: "ACCOUNT_ALREADY_ACTIVE" }, { status: 400 });

    const { data: level, error: levelError } = await db.from("activation_levels").select("level,name,activation_fee,active").eq("level", selectedLevel).eq("active", true).maybeSingle();
    if (levelError) throw levelError;
    if (!level) return NextResponse.json({ error: "ACTIVATION_LEVEL_UNAVAILABLE" }, { status: 400 });

    const activationLevel = level as ActivationLevel;
    const amount = Math.round(Number(activationLevel.activation_fee));
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "ACTIVATION_FEE_NOT_CONFIGURED" }, { status: 500 });

    const txRef = `VC-ACT-${user.id}-${selectedLevel}-${Date.now()}`;
    const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://viewcash-olive.vercel.app").replace(/\/$/, "");
    const { error: insertError } = await db.from("activation_requests").insert({ user_id: user.id, amount, currency: "NGN", tx_ref: txRef, status: "pending", metadata: { account_level: selectedLevel, level_name: activationLevel.name } });
    if (insertError) throw insertError;

    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${flutterwaveSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef,
        amount,
        currency: "NGN",
        redirect_url: `${base}/activation-callback`,
        customer: { email: String(email).trim() },
        meta: { user_id: user.id, purpose: "viewcash_activation", account_level: selectedLevel, level_name: activationLevel.name },
        customizations: { title: `${activationLevel.name} Activation`, description: `Activate your ViewCash ${activationLevel.name} account.` }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== "success" || !data.data?.link) {
      await db.from("activation_requests").update({ status: "failed", updated_at: new Date().toISOString() }).eq("tx_ref", txRef);
      return NextResponse.json({ error: data.message || "Flutterwave could not start the payment." }, { status: 502 });
    }
    return NextResponse.json({ payment_url: data.data.link, tx_ref: txRef, amount, account_level: selectedLevel, level_name: activationLevel.name });
  } catch (error) {
    console.error("ViewCash activation checkout error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start activation payment." }, { status: 500 });
  }
}
