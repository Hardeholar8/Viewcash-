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
  const { data, error } = await supabase.from("tasks").select("id,title,description,reward,task_type,action_url,daily_limit,completion_limit,completed_count,status,created_at,updated_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "ADMIN_TASKS_ERROR" }, { status: 500 });
  return NextResponse.json({ tasks: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const description = body?.description == null ? null : String(body.description).trim();
  const reward = Number(body?.reward);
  const taskType = String(body?.task_type || "manual").trim();
  const actionUrl = body?.action_url ? String(body.action_url).trim() : null;
  const dailyLimit = body?.daily_limit === "" || body?.daily_limit == null ? null : Number(body.daily_limit);
  const completionLimit = body?.completion_limit === "" || body?.completion_limit == null ? null : Number(body.completion_limit);
  const status = body?.status === "inactive" ? "inactive" : "active";
  if (!title || !Number.isFinite(reward) || reward < 0 || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1)) || (completionLimit !== null && (!Number.isInteger(completionLimit) || completionLimit < 1))) return NextResponse.json({ error: "INVALID_TASK" }, { status: 400 });
  const { data, error } = await supabase.from("tasks").insert({ title, description, reward, task_type: taskType, action_url: actionUrl, daily_limit: dailyLimit, completion_limit: completionLimit, status }).select().single();
  if (error) return NextResponse.json({ error: "ADMIN_TASK_CREATE_ERROR" }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "TASK_ID_REQUIRED" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "description", "task_type", "action_url", "status"]) if (body?.[key] !== undefined) updates[key] = body[key] === null ? null : String(body[key]).trim();
  for (const key of ["reward", "daily_limit", "completion_limit"]) if (body?.[key] !== undefined) updates[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
  if (updates.title !== undefined && !updates.title) return NextResponse.json({ error: "INVALID_TASK" }, { status: 400 });
  if (updates.reward !== undefined && (updates.reward === null || !Number.isFinite(Number(updates.reward)) || Number(updates.reward) < 0)) return NextResponse.json({ error: "INVALID_TASK" }, { status: 400 });
  for (const key of ["daily_limit", "completion_limit"]) if (updates[key] !== undefined && updates[key] !== null && (!Number.isInteger(Number(updates[key])) || Number(updates[key]) < 1)) return NextResponse.json({ error: "INVALID_TASK" }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "ADMIN_TASK_UPDATE_ERROR" }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "TASK_ID_REQUIRED" }, { status: 400 });
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ADMIN_TASK_DELETE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
