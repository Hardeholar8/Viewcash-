import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validAdminCookie(value: string | undefined, secret: string) {
  if (!value) return false;
  const [id, time, sig] = value.split(".");
  if (!id || !time || !sig || Date.now() - Number(time) > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${time}`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !validAdminCookie(req.cookies.get("viewcash_admin")?.value, key)) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const [users, ads, withdrawals, flagged] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("ad_rewards").select("id", { count: "exact", head: true }).eq("reward_event_type", "valued"),
    supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("fraud_flags").select("id", { count: "exact", head: true }).eq("resolved", false),
  ]);
  if (users.error || ads.error || withdrawals.error || flagged.error) return NextResponse.json({ error: "ADMIN_STATS_ERROR" }, { status: 500 });
  return NextResponse.json({ users: users.count || 0, ads: ads.count || 0, withdrawals: withdrawals.count || 0, flagged: flagged.count || 0 });
}
