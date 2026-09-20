import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { checkTaskFraud } from "@/lib/fraud";

const VIEWCASH_SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

function validateInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData || "");
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_SESSION_INVALID");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k,v]) => `${k}=${v}`).join("\n");
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SERVER_CONFIG_ERROR");
  return createClient(VIEWCASH_SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizeTelegramChat(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^-100\d+$/.test(raw) || /^-\d+$/.test(raw)) return raw;
  if (/^@[A-Za-z0-9_]{5,}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === "t.me" || url.hostname === "telegram.me") {
      const first = url.pathname.split("/").filter(Boolean)[0] || "";
      if (/^[A-Za-z0-9_]{5,}$/.test(first) && !first.startsWith("+") && first !== "joinchat") return `@${first}`;
    }
  } catch {}
  if (/^[A-Za-z0-9_]{5,}$/.test(raw)) return `@${raw}`;
  return raw;
}

async function telegramMember(chat: string, userId: number, token: string) {
  const normalizedChat = normalizeTelegramChat(chat);
  if (!normalizedChat) throw new Error("TELEGRAM_TASK_NOT_CONFIGURED");

  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(normalizedChat)}&user_id=${userId}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    const description = String(data?.description || "");
    if (/chat not found/i.test(description)) throw new Error("TELEGRAM_CHAT_NOT_FOUND");
    if (/bot is not a member|bot is not an administrator|not enough rights|forbidden/i.test(description)) throw new Error("TELEGRAM_BOT_ACCESS_REQUIRED");
    if (/user not found/i.test(description)) throw new Error("TELEGRAM_USER_NOT_FOUND_IN_CHAT");
    throw new Error("TELEGRAM_VERIFY_FAILED");
  }

  const member = data.result;
  const status = String(member?.status || "");
  // Telegram can return restricted members; is_member is the reliable membership flag there.
  return ["creator", "administrator", "member"].includes(status) || (status === "restricted" && member?.is_member === true);
}

export async function GET(req: NextRequest) {
  try {
    const initData = String(req.nextUrl.searchParams.get("initData") || "");
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("SERVER_CONFIG_ERROR");
    const tgUser = validateInitData(initData, token);
    const supabase = db();
    const { data: user } = await supabase.from("users").select("id,status").eq("telegram_id", tgUser.id).single();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });

    const [{ data: taskData, error: taskError }, { data: completionData, error: completionError }] = await Promise.all([
      supabase.from("tasks").select("id,title,description,reward,task_type,action_url,daily_limit,completion_limit,completed_count,proof_required,verification_type,telegram_chat").eq("status","active").order("created_at", { ascending: false }),
      supabase.from("task_completions").select("id,task_id,status,proof_url,created_at,reviewed_at,tasks(id,title,description,reward,task_type,action_url,daily_limit,completion_limit,completed_count,proof_required,verification_type,telegram_chat)").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);
    if (taskError || completionError) throw taskError || completionError;

    const completions = completionData || [];
    const blockedIds = new Set(completions.filter((c:any) => c.status === "pending" || c.status === "approved").map((c:any) => c.task_id));
    const activeTasks = (taskData || []).filter((t:any) => !blockedIds.has(t.id));
    const pendingTasks = completions.filter((c:any) => c.status === "pending");
    const approvedTasks = completions.filter((c:any) => c.status === "approved");
    const rejectedTasks = completions.filter((c:any) => c.status === "rejected");

    return NextResponse.json({ tasks: activeTasks, pendingTasks, approvedTasks, rejectedTasks });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load opportunities. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const taskId = String(body?.task_id || "");
    const initData = String(body?.initData || "");
    const proofUrl = body?.proof_url ? String(body.proof_url).trim() : null;
    if (!taskId || !initData) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("SERVER_CONFIG_ERROR");
    const tgUser = validateInitData(initData, token);
    const supabase = db();
    const { data: user, error: userError } = await supabase.from("users").select("id,telegram_id,status").eq("telegram_id", tgUser.id).single();
    if (userError || !user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "ACCOUNT_NOT_ACTIVE" }, { status: 403 });
    const fraud = await checkTaskFraud(user.id);
    if (!fraud.allowed) return NextResponse.json({ error: fraud.error }, { status: 429 });
    const { data: task, error: taskError } = await supabase.from("tasks").select("id,title,task_type,verification_type,telegram_chat,action_url,proof_required").eq("id", taskId).single();
    if (taskError || !task) return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });

    if (task.verification_type === "telegram" || task.task_type === "telegram") {
      const chat = task.telegram_chat || task.action_url;
      if (!chat) return NextResponse.json({ error: "TELEGRAM_TASK_NOT_CONFIGURED" }, { status: 400 });
      const member = await telegramMember(chat, tgUser.id, token);
      if (!member) return NextResponse.json({ error: "TELEGRAM_MEMBERSHIP_NOT_FOUND" }, { status: 400 });
      const { data, error } = await supabase.rpc("complete_verified_task", { p_task_id: task.id, p_user_id: user.id, p_proof_url: null });
      if (error) throw error;
      if (!data?.ok) return NextResponse.json({ error: data?.error || "TASK_NOT_COMPLETED", status: data?.status }, { status: 400 });
      return NextResponse.json(data);
    }

    if (!task.proof_required) return NextResponse.json({ error: "VERIFICATION_NOT_AVAILABLE" }, { status: 400 });
    if (!proofUrl || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(proofUrl)) return NextResponse.json({ error: "PROOF_SCREENSHOT_REQUIRED" }, { status: 400 });
    if (proofUrl.length > 2500000) return NextResponse.json({ error: "PROOF_SCREENSHOT_TOO_LARGE" }, { status: 413 });
    const { data, error } = await supabase.rpc("complete_verified_task", { p_task_id: task.id, p_user_id: user.id, p_proof_url: proofUrl });
    if (error) throw error;
    if (!data?.ok) return NextResponse.json({ error: data?.error || "TASK_NOT_COMPLETED", status: data?.status }, { status: 400 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("ViewCash task verification error", error);
    return NextResponse.json({ error: "Unable to submit this opportunity right now. Please try again." }, { status: 500 });
  }
}
