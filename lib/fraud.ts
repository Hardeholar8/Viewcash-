import { createClient } from "@supabase/supabase-js";

export type FraudResult = { allowed: true } | { allowed: false; error: string };

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SERVER_CONFIG_ERROR");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function setting(supabase: ReturnType<typeof db>, key: string, fallback: number | boolean) {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  const value = data?.value as Record<string, unknown> | boolean | number | null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (value && typeof value === "object" && "value" in value) return (value as Record<string, unknown>).value as number | boolean;
  return fallback;
}

async function flag(supabase: ReturnType<typeof db>, userId: string, reason: string, severity: "low" | "medium" | "high" | "critical", metadata: Record<string, unknown> = {}) {
  await supabase.from("fraud_flags").insert({ user_id: userId, reason, severity, metadata });
  if (severity === "critical" && Boolean(await setting(supabase, "fraud_auto_suspend_critical", true))) {
    await supabase.from("users").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", userId);
  }
}

export async function checkWithdrawalFraud(userId: string): Promise<FraudResult> {
  const supabase = db();
  const max = Number(await setting(supabase, "fraud_max_withdrawals_per_day", 2));
  const { count } = await supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if ((count ?? 0) >= max) {
    await flag(supabase, userId, "Withdrawal frequency exceeded", "high", { count, max });
    return { allowed: false, error: "WITHDRAWAL_LIMIT_REACHED" };
  }
  return { allowed: true };
}

export async function checkTaskFraud(userId: string): Promise<FraudResult> {
  const supabase = db();
  const enabled = Boolean(await setting(supabase, "fraud_flag_rapid_activity", true));
  if (!enabled) return { allowed: true };
  const max = Number(await setting(supabase, "fraud_max_tasks_per_minute", 5));
  const since = new Date(Date.now() - 60000).toISOString();
  const { count } = await supabase.from("task_completions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((count ?? 0) >= max) {
    await flag(supabase, userId, "Rapid task activity detected", "high", { count, max });
    return { allowed: false, error: "ACTIVITY_LIMIT_REACHED" };
  }
  return { allowed: true };
}
