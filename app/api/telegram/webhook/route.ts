import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });

    const update = await req.json();
    const message = update?.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = String(message.text || "");
    const webAppUrl = "https://viewcash-olive.vercel.app";

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
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ViewCash Telegram webhook error", error);
    return NextResponse.json({ ok: true });
  }
}
