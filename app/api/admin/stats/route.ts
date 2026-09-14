import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "ADMIN_CONFIG_ERROR" }, { status: 500 });
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
