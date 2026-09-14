import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function adminOk(req: NextRequest, secret: string) {
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [id, timestamp, signature] = parts;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(timestamp) || !Number.isFinite(age) || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${timestamp}`).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function db(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !adminOk(req, key)) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status");
  let query = supabase.from("withdrawals").select("id,user_id,amount,bank_name,account_name,account_number,status,admin_note,created_at,processed_at,users(telegram_id,username,first_name,last_name)").order("created_at", { ascending: false });
  if (status && ["pending", "approved", "paid", "rejected", "cancelled"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "ADMIN_WITHDRAWALS_ERROR" }, { status: 500 });
  return NextResponse.json({ withdrawals: data || [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const status = String(body?.status || "").trim();
  const adminNote = body?.admin_note == null ? null : String(body.admin_note).trim();
  if (!id || !["pending", "approved", "paid", "rejected", "cancelled"].includes(status)) return NextResponse.json({ error: "INVALID_WITHDRAWAL_UPDATE" }, { status: 400 });
  const { data: withdrawal, error: lookupError } = await supabase.from("withdrawals").select("id,status,user_id,amount").eq("id", id).single();
  if (lookupError || !withdrawal) return NextResponse.json({ error: "WITHDRAWAL_NOT_FOUND" }, { status: 404 });
  if (withdrawal.status === "paid") return NextResponse.json({ error: "WITHDRAWAL_ALREADY_PAID" }, { status: 409 });

  if (status === "rejected" && withdrawal.status === "pending") {
    const { data: rejected, error } = await supabase.rpc("reject_withdrawal", { p_withdrawal_id: id, p_admin_note: adminNote });
    if (error) return NextResponse.json({ error: "WITHDRAWAL_REJECTION_ERROR" }, { status: 500 });
    if (!rejected?.ok) return NextResponse.json({ error: String(rejected?.error || "WITHDRAWAL_REJECTION_ERROR") }, { status: 409 });
    const { data } = await supabase.from("withdrawals").select("id,user_id,amount,bank_name,account_name,account_number,status,admin_note,created_at,processed_at,users(telegram_id,username,first_name,last_name)").eq("id", id).single();
    return NextResponse.json({ withdrawal: data });
  }

  if (status === "rejected" && withdrawal.status !== "pending") return NextResponse.json({ error: "WITHDRAWAL_NOT_PENDING" }, { status: 409 });
  if (status === "cancelled" && withdrawal.status === "paid") return NextResponse.json({ error: "WITHDRAWAL_ALREADY_PAID" }, { status: 409 });

  const updates: Record<string, unknown> = { status, admin_note: adminNote, processed_at: new Date().toISOString() };
  const { data, error } = await supabase.from("withdrawals").update(updates).eq("id", id).select("id,user_id,amount,bank_name,account_name,account_number,status,admin_note,created_at,processed_at,users(telegram_id,username,first_name,last_name)").single();
  if (error) return NextResponse.json({ error: "WITHDRAWAL_UPDATE_ERROR" }, { status: 500 });
  return NextResponse.json({ withdrawal: data });
}
