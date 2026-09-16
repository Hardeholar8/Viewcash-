import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!token || !supabaseUrl || !supabaseKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });

    const update = await req.json();
    const event = update?.message || update?.channel_post;
    if (!event?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = event.chat.id;
    const text = String(event.text || event.caption || "").trim();
    const webAppUrl = "https://viewcash-olive.vercel.app";
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const connectMatch = text.match(/^\/connect(?:@[^\s]+)?\s+([A-Za-z0-9_-]{16,})\s*$/i);
    if (connectMatch) {
      const pending = `pending:${connectMatch[1]}`;
      const { data: task } = await supabase.from("tasks").select("id").eq("telegram_chat", pending).eq("task_type", "telegram").limit(1).maybeSingle();
      if (task) {
        await supabase.from("tasks").update({ telegram_chat: String(chatId), updated_at: new Date().toISOString() }).eq("id", task.id);
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: "ViewCash connected successfully. This chat can now be used for Telegram task verification." }),
            cache: "no-store"
          });
        } catch {}
      }
    }

    if (text === "/start" || text.startsWith("/start ")) {
      const payload = {
        chat_id: chatId,
        text: "Welcome to ViewCash!\n\nWatch rewarded ads, complete tasks, build your balance and withdraw eligible earnings.",
        reply_markup: {
          inline_keyboard: [[{ text: "Open ViewCash", web_app: { url: webAppUrl } }]],
        },
      };
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ViewCash Telegram webhook error", error);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "ViewCash Telegram webhook" });
}
