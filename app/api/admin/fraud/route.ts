import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function getDb(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!url || !key || !raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [id, timestamp, signature] = parts;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(timestamp) || !Number.isFinite(age) || age < 0 || age > 8 * 60 * 60 * 1000) return null;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}`).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supabase = getDb(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") || "all";
  const severity = req.nextUrl.searchParams.get("severity") || "all";
  const [{ data, error }, { data: summary, error: summaryError }] = await Promise.all([
    supabase.rpc("admin_fraud_flags", { p_status: status, p_severity: severity }),
    supabase.rpc("admin_fraud_summary")
  ]);
  if (error || summaryError) return NextResponse.json({ error: "FRAUD_DATA_UNAVAILABLE" }, { status: 500 });
  return NextResponse.json({ flags: data || [], summary: summary || { open: 0, critical: 0, high: 0, medium: 0, low: 0 } });
}

export async function PATCH(req: NextRequest) {
  const supabase = getDb(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "INVALID_FLAG" }, { status: 400 });
  const { data, error } = await supabase.rpc("resolve_fraud_flag", { p_flag_id: id });
  if (error) return NextResponse.json({ error: "FRAUD_UPDATE_ERROR" }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: data?.error || "FRAUD_UPDATE_ERROR" }, { status: 409 });
  return NextResponse.json(data);
}
