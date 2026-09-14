import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function validateInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData || "");
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_SESSION_INVALID");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error("TELEGRAM_SESSION_INVALID");
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now()/1000 - authDate > 86400) throw new Error("TELEGRAM_SESSION_EXPIRED");
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("TELEGRAM_USER_MISSING");
  return JSON.parse(rawUser) as { id: number };
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SERVER_CONFIG_ERROR");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function telegramMember(chat: string, userId: number, token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${userId}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error("TELEGRAM_VERIFY_FAILED");
  const status = data.result?.status;
  return ["creator", "administrator", "member"].includes(status);
}

export async function GET() {
  try {
    const supabase = db();
    const { data, error } = await supabase.from("tasks").select("id,title,description,reward,task_type,action_url,daily_limit,completion_limit,completed_count,proof_required,verification_type,telegram_chat").eq("status","active").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tasks: data || [] });
  } catch { return NextResponse.json({ error: "TASKS_UNAVAILABLE" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const taskId = String(body?.task_id || "");
    const initData = String(body?.initData || "");
    if (!taskId || !initData) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("SERVER_CONFIG_ERROR");
    const tgUser = validateInitData(initData, token);
    const supabase = db();
    const { data: user, error: userError } = await supabase.from("users").select("id,telegram_id").eq("telegram_id", tgUser.id).single();
    if (userError || !user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    const { data: task, error: taskError } = await supabase.from("tasks").select("id,title,task_type,verification_type,telegram_chat,action_url,proof_required").eq("id", taskId).single();
    if (taskError || !task) return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });

    if (task.verification_type === "telegram" || task.task_type === "telegram") {
      const chat = task.telegram_chat || task.action_url;
      if (!chat) return NextResponse.json({ error: "TELEGRAM_TASK_NOT_CONFIGURED" }, { status: 400 });
      const member = await telegramMember(chat, tgUser.id, token);
      if (!member) return NextResponse.json({ error: "TELEGRAM_MEMBERSHIP_NOT_FOUND" }, { status: 400 });
      const { data, error } = await supabase.rpc("complete_verified_task", { p_task_id: task.id, p_user_id: user.id, p_proof_url: null });
      if (error) throw error;
      if (!data?.ok) return NextResponse.json({ error: data?.error || "TASK_NOT_COMPLETED" }, { status: 400 });
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: task.proof_required ? "PROOF_REQUIRED" : "VERIFICATION_NOT_AVAILABLE" }, { status: 400 });
  } catch (error) {
    console.error("ViewCash task verification error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "TASK_VERIFICATION_FAILED" }, { status: 500 });
  }
}
