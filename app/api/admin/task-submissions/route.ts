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
  if (!/^\d+$/.test(id) || !Number.isFinite(age) || age < 0 || age > 8 * 60 * 60 * 1000) return false;
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
  const status = req.nextUrl.searchParams.get("status") || "pending";
  const query = supabase
    .from("task_completions")
    .select("id,task_id,user_id,proof_url,status,created_at,reviewed_at,users(telegram_id,username,first_name,last_name),tasks(title,reward)")
    .order("created_at", { ascending: false });
  const { data, error } = status === "all" ? await query : await query.eq("status", status);
  if (error) return NextResponse.json({ error: "TASK_SUBMISSIONS_LOAD_ERROR" }, { status: 500 });
  return NextResponse.json({ submissions: data || [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  const action = String(body?.action || "");
  if (!id || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "INVALID_REVIEW_REQUEST" }, { status: 400 });
  const { data, error } = await supabase.rpc("admin_review_task_completion", { p_completion_id: id, p_action: action });
  if (error) return NextResponse.json({ error: "TASK_REVIEW_ERROR" }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: data?.error || "TASK_REVIEW_FAILED", status: data?.status }, { status: 400 });
  return NextResponse.json(data);
}
