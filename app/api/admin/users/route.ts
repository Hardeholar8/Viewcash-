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

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "ADMIN_CONFIG_ERROR" }, { status: 500 });
  if (!validSession(req.cookies.get("viewcash_admin")?.value, key)) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  let query = supabase.from("users").select("id,telegram_id,username,first_name,last_name,referral_code,status,created_at,wallets(balance,referral_balance,total_earned,total_withdrawn)").order("created_at", { ascending: false }).limit(100);
  if (search) query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "ADMIN_USERS_ERROR" }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}
