import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

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
    const { initData, tx_ref, transaction_id } = await req.json();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const flutterwaveSecret = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || process.env.SECRET_KEY;
    if (!token || !key) throw new Error("SERVER_CONFIG_ERROR");
    if (!flutterwaveSecret) throw new Error("FLUTTERWAVE_NOT_CONFIGURED");
    if (!tx_ref && !transaction_id) return NextResponse.json({ error: "MISSING_PAYMENT_REFERENCE" }, { status: 400 });

    const tg = telegramUser(String(initData || ""), token);
    const db = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id,status,activated").eq("telegram_id", tg.id).single();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });
    if (user.activated) return NextResponse.json({ ok: true, activated: true, already_activated: true });

    const verifyUrl = transaction_id
      ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`
      : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`;
    const r = await fetch(verifyUrl, { headers: { Authorization: `Bearer ${flutterwaveSecret}` } });
    const j = await r.json().catch(() => ({}));
    const payment = j?.data || {};
    if (!r.ok || j.status !== "success" || payment.status !== "successful") {
      return NextResponse.json({ error: payment.status === "pending" ? "Payment is still being confirmed. Please wait a moment and try again." : "Payment verification failed.", verified: false, payment_status: payment.status || null }, { status: 400 });
    }

    const verifiedRef = String(payment.tx_ref || tx_ref || "").trim();
    const { data: request } = await db.from("activation_requests").select("id,user_id,amount,status").eq("tx_ref", verifiedRef).eq("user_id", user.id).maybeSingle();
    if (!request) return NextResponse.json({ error: "INVALID_ACTIVATION_PAYMENT" }, { status: 400 });
    if (request.status === "paid") return NextResponse.json({ ok: true, activated: true });
    if (request.status !== "pending") return NextResponse.json({ error: "ACTIVATION_PAYMENT_NOT_PENDING" }, { status: 400 });
    if (String(payment.currency) !== "NGN" || Number(payment.amount) !== Number(request.amount)) return NextResponse.json({ error: "ACTIVATION_PAYMENT_AMOUNT_MISMATCH" }, { status: 400 });

    const { data, error } = await db.rpc("activate_viewcash_account", { p_user_id: user.id, p_amount: Number(payment.amount), p_reference: verifiedRef, p_transaction_id: String(payment.id || transaction_id || "") });
    if (error) throw error;
    if (!data?.ok) return NextResponse.json({ error: String(data?.error || "ACTIVATION_FAILED") }, { status: 400 });
    return NextResponse.json({ ...data, verified: true, amount: Number(payment.amount), tx_ref: verifiedRef });
  } catch (error) {
    console.error("ViewCash activation verification error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify activation payment." }, { status: 500 });
  }
}
