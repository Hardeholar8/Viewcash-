const CHANNEL_ID = process.env.TELEGRAM_REDEMPTION_CHANNEL_ID || "@viewcashc";
const BOT_TOKEN = process.env.TELEGRAM_REDEMPTION_BOT_TOKEN;

async function telegram(method: string, body: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_REDEMPTION_BOT_TOKEN is not configured");
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.description || `Telegram API error: ${res.status}`);
  return data.result;
}

function maskPhone(phone: string) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)}******${digits.slice(-2)}`;
}

export async function sendRedemptionMessage(input: {
  id: string;
  username?: string | null;
  firstName?: string | null;
  amountMb: number;
  network: string;
  phoneNumber: string;
  redemptionNumber: number;
}) {
  const text = [
    "╔══════════════════════════╗",
    "║ 📡 NEW DATA REDEMPTION ║",
    "╚══════════════════════════╝",
    "",
    `🔖 ID: #VC-${input.id.slice(0, 8).toUpperCase()}`,
    `👤 User: ${input.username ? "@" + input.username : input.firstName || "User"}`,
    `🔢 Redemption #: ${input.redemptionNumber}`,
    `📥 Receive: ${Number(input.amountMb).toLocaleString()} MB`,
    `📡 Network: ${input.network}`,
    `📞 Number: ${maskPhone(input.phoneNumber)}`,
    "⏳ Status: Processing",
    "",
    "📡 VIEWCASH • DATA REWARDS",
  ].join("\n");
  return telegram("sendMessage", { chat_id: CHANNEL_ID, text, disable_web_page_preview: true });
}

export async function updateRedemptionMessage(messageId: number, input: {
  id: string;
  username?: string | null;
  firstName?: string | null;
  amountMb: number;
  network: string;
  phoneNumber: string;
  redemptionNumber: number;
  status: string;
}) {
  const statusText =
    input.status === "completed" ? "✅ Status: Completed" :
    input.status === "rejected" ? "❌ Status: Failed" :
    input.status === "approved" ? "⏳ Status: Processing" :
    `⏳ Status: ${input.status.charAt(0).toUpperCase() + input.status.slice(1)}`;
  const text = [
    "╔══════════════════════════╗",
    "║ 📡 DATA REDEMPTION ║",
    "╚══════════════════════════╝",
    "",
    `🔖 ID: #VC-${input.id.slice(0, 8).toUpperCase()}`,
    `👤 User: ${input.username ? "@" + input.username : input.firstName || "User"}`,
    `🔢 Redemption #: ${input.redemptionNumber}`,
    `📥 Receive: ${Number(input.amountMb).toLocaleString()} MB`,
    `📡 Network: ${input.network}`,
    `📞 Number: ${maskPhone(input.phoneNumber)}`,
    statusText,
    "",
    "📡 VIEWCASH • DATA REWARDS",
  ].join("\n");
  return telegram("editMessageText", { chat_id: CHANNEL_ID, message_id: messageId, text, disable_web_page_preview: true });
}
