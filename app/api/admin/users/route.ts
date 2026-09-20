import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validSession(value: string | undefined, secret: string) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, timestamp, signature] = parts;
  const payload = `${id}.${timestamp}`;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(timestamp) || !signature || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
function db(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !validSession(req.cookies.get("viewcash_admin")?.value, key)) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  let query = supabase.from("users").select("id,telegram_id,username,first_name,last_name,referral_code,status,redemption_override,created_at,wallets(balance,referral_balance,total_earned,total_withdrawn)").order("created_at", { ascending: false }).limit(100);
  if (search) query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "ADMIN_USERS_ERROR" }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const status = String(body?.status || "").trim();
  const hasOverride = typeof body?.redemption_override === "boolean";
  if (!id || (status && !["active","suspended","pending"].includes(status)) || (!status && !hasOverride)) return NextResponse.json({ error: "INVALID_USER_UPDATE" }, { status: 400 });
  const update:any = { updated_at: new Date().toISOString() };
  if (status) update.status = status;
  if (hasOverride) update.redemption_override = body.redemption_override;
  const { error } = await supabase.from("users").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "USER_UPDATE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}