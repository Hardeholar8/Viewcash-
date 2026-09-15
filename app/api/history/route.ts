import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const VIEWCASH_SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

type HistoryItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  amount: number;
  balance_type: string;
  status: string;
  created_at: string;
};

function validateTelegram(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  const raw = params.get("user");
  if (!raw) return null;
  try { return JSON.parse(raw) as { id?: number }; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const initData = String(body?.initData || "");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!botToken || !serviceKey) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
    const tg = validateTelegram(initData, botToken);
    if (!tg?.id) return NextResponse.json({ error: "INVALID_TELEGRAM_SESSION" }, { status: 401 });

    const db = createClient(VIEWCASH_SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: user } = await db.from("users").select("id").eq("telegram_id", tg.id).maybeSingle();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

    const userId = user.id;
    const [transactions, checkins, ads, withdrawals] = await Promise.all([
      db.from("transactions").select("id,type,amount,balance_type,reference,description,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      db.from("daily_checkins").select("id,reward_coins,streak_day,checkin_date,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      db.from("ad_rewards").select("id,reward_amount,reward_event_type,provider,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      db.from("withdrawals").select("id,coin_amount,amount,balance_type,status,bank_name,created_at,processed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
    ]);

    if (transactions.error || checkins.error || ads.error || withdrawals.error) {
      console.error("ViewCash history query error", { transactions: transactions.error, checkins: checkins.error, ads: ads.error, withdrawals: withdrawals.error });
      return NextResponse.json({ error: "Unable to load history." }, { status: 500 });
    }

    const items: HistoryItem[] = [];
    // ad_rewards is the canonical record for rewarded ads. The credit RPC also
    // creates a transaction row, so do not render that same reward twice.
    for (const row of transactions.data || []) {
      const type = String(row.type || "").toLowerCase();
      const reference = String(row.reference || "").toLowerCase();
      const description = String(row.description || "").toLowerCase();
      if (type === "ad_reward" || reference.startsWith("ad_reward:") || description.includes("monetag rewarded ad")) continue;
      items.push({ id: `tx-${row.id}`, type: "transaction", title: String(row.type || "Transaction").replace(/_/g, " "), description: row.description || row.reference || "Wallet activity", amount: Number(row.amount || 0), balance_type: row.balance_type || "tasks", status: "completed", created_at: row.created_at });
    }
    for (const row of checkins.data || []) {
      items.push({ id: `checkin-${row.id}`, type: "checkin", title: "Daily Check-in", description: `Day ${Number(row.streak_day || 1)} streak`, amount: Number(row.reward_coins || 0), balance_type: "tasks", status: "completed", created_at: row.created_at });
    }
    for (const row of ads.data || []) {
      if (Number(row.reward_amount || 0) <= 0) continue;
      items.push({ id: `ad-${row.id}`, type: "ad", title: "Rewarded Ad", description: `${row.provider || "Ad partner"} • ${row.reward_event_type || "completed"}`, amount: Number(row.reward_amount || 0), balance_type: "tasks", status: "completed", created_at: row.created_at });
    }
    for (const row of withdrawals.data || []) {
      const amount = Number(row.coin_amount || 0);
      items.push({ id: `withdrawal-${row.id}`, type: "withdrawal", title: "Withdrawal", description: `${row.balance_type === "affiliate" ? "Affiliate" : "Task"} wallet${row.bank_name ? ` • ${row.bank_name}` : ""}`, amount: -Math.abs(amount), balance_type: row.balance_type || "tasks", status: String(row.status || "pending"), created_at: row.created_at });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return NextResponse.json({ ok: true, history: items.slice(0, 100) });
  } catch (error) {
    console.error("ViewCash history error", error);
    return NextResponse.json({ error: "Unable to load history." }, { status: 500 });
  }
}
