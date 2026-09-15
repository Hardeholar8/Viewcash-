import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function db(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!secret || !raw) return null;
  const [id, timestamp, signature] = raw.split(".");
  if (!id || !timestamp || !signature || !/^\d+$/.test(id) || !/^\d+$/.test(timestamp)) return null;
  const age = Date.now() - Number(timestamp);
  if (age < 0 || age > 8 * 60 * 60 * 1000) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${timestamp}`).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
const num = (v: unknown, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; };

export async function GET(req: NextRequest) {
  const dbx = db(req); if (!dbx) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const { data, error } = await dbx.from("activation_levels").select("level,name,activation_fee,daily_earning_cap,task_min_withdrawal,affiliate_min_withdrawal,active").order("level");
  if (error) return NextResponse.json({ error: "PLAN_LOAD_ERROR" }, { status: 500 });
  return NextResponse.json({ plans: data || [] });
}

export async function PATCH(req: NextRequest) {
  const dbx = db(req); if (!dbx) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const b = await req.json().catch(() => null);
  const level = Math.floor(num(b?.level));
  const name = String(b?.name || "").trim();
  const fee = num(b?.activation_fee), cap = num(b?.daily_earning_cap), task = num(b?.task_min_withdrawal), affiliate = num(b?.affiliate_min_withdrawal);
  const active = Boolean(b?.active);
  if (level < 1 || !name || fee < 0 || cap < 0 || task < 0 || affiliate < 0) return NextResponse.json({ error: "INVALID_PLAN_SETTINGS" }, { status: 400 });
  const { error } = await dbx.from("activation_levels").update({ name, activation_fee: fee, daily_earning_cap: cap, task_min_withdrawal: task, affiliate_min_withdrawal: affiliate, active }).eq("level", level);
  if (error) return NextResponse.json({ error: "PLAN_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
