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

export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const taskId = String(body?.task_id || "");
  if (!taskId) return NextResponse.json({ error: "TASK_ID_REQUIRED" }, { status: 400 });

  const { data: task, error: taskError } = await supabase.from("tasks").select("id,task_type,action_url,telegram_chat").eq("id", taskId).single();
  if (taskError || !task) return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
  if (task.task_type !== "telegram") return NextResponse.json({ error: "TELEGRAM_TASK_REQUIRED" }, { status: 400 });

  const token = crypto.randomBytes(18).toString("base64url");
  const pending = `pending:${token}`;
  const { error: updateError } = await supabase.from("tasks").update({ telegram_chat: pending, updated_at: new Date().toISOString() }).eq("id", taskId);
  if (updateError) return NextResponse.json({ error: "TELEGRAM_CONNECT_SETUP_FAILED" }, { status: 500 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });

  // Telegram must reach this endpoint without Vercel authentication.
  // viewcash-olive.vercel.app is the public production domain used by the webhook.
  const webhookUrl = "https://viewcash-olive.vercel.app/api/telegram/webhook";
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "channel_post"] }),
    cache: "no-store"
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    await supabase.from("tasks").update({ telegram_chat: task.telegram_chat || null, updated_at: new Date().toISOString() }).eq("id", taskId);
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SETUP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token, command: `/connect ${token}` });
}
