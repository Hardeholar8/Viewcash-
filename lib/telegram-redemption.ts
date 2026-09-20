const BOT_TOKEN = process.env.TELEGRAM_REDEMPTION_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_REDEMPTION_CHANNEL_ID || "@viewcashc";

async function callTelegram(method: string, body: Record<string, unknown>): Promise<any> {
  if (!BOT_TOKEN) throw new Error("Telegram redemption bot token is not configured");
  const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || "Telegram API request failed");
  return data.result;
}

function maskPhone(phone: string): string {
  const value = String(phone).replace(/\D/g, "");
  return value.length >= 7 ? value.slice(0, 3) + "******" + value.slice(-2) : value;
}

function format(input: {
  id: string;
  username?: string | null;
  firstName?: string | null;
  amountMb: number;
  network: string;
  phoneNumber: string;
  redemptionNumber: number;
  status: string;
}): string {
  const status = input.status === "completed" ? "✅ Status: Completed"
    : input.status === "rejected" ? "❌ Status: Failed"
    : "⏳ Status: Processing";
  return [
    "╔══════════════════════════╗",
    "║ 📡 DATA REDEMPTION ║",
    "╚══════════════════════════╝",
    "",
    "🔖 ID: #VC-" + input.id.slice(0, 8).toUpperCase(),
    "👤 User: " + (input.username ? "@" + input.username : input.firstName || "User"),
    "🔢 Redemption #: " + input.redemptionNumber,
    "📥 Receive: " + Number(input.amountMb).toLocaleString() + " MB",
    "📡 Network: " + input.network,
    "📞 Number: " + maskPhone(input.phoneNumber),
    status,
    "",
    "📡 VIEWCASH • DATA REWARDS",
  ].join("\n");
}

export async function sendRedemptionMessage(input: Omit<Parameters<typeof format>[0], "status">): Promise<any> {
  return callTelegram("sendMessage", { chat_id: CHANNEL_ID, text: format({ ...input, status: "pending" }) });
}

export async function updateRedemptionMessage(messageId: number, input: Parameters<typeof format>[0]): Promise<any> {
  return callTelegram("editMessageText", { chat_id: CHANNEL_ID, message_id: messageId, text: format(input) });
}
