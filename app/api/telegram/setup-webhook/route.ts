import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const setupKey = process.env.WEBHOOK_SETUP_KEY;
  const providedKey = req.nextUrl.searchParams.get("key");
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!setupKey || !token || providedKey !== setupKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = "https://viewcash-olive.vercel.app/api/telegram/webhook";
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
    cache: "no-store",
  });

  const result = await response.json();
  return NextResponse.json({ ok: result.ok === true, telegram: result });
}
