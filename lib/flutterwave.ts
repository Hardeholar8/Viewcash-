const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

function getSecretKey() {
  const raw = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || process.env.SECRET_KEY || "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

async function flutterwave(path: string, init: RequestInit = {}) {
  const secret = getSecretKey();
  if (!secret) throw new Error("FLUTTERWAVE_NOT_CONFIGURED");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(`${FLUTTERWAVE_BASE}${path}`, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function getNigeriaBanks() {
  const { response, data } = await flutterwave("/banks/NG");
  if (!response.ok || data?.status !== "success") {
    throw new Error(data?.message || "Unable to load banks");
  }
  return (Array.isArray(data.data) ? data.data : []).map((bank: any) => ({
    code: String(bank.code || ""),
    name: String(bank.name || ""),
  })).filter((bank: { code: string; name: string }) => bank.code && bank.name);
}

export async function resolveNigeriaAccount(accountNumber: string, bankCode: string) {
  const { response, data } = await flutterwave("/accounts/resolve", {
    method: "POST",
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
  });
  if (!response.ok || data?.status !== "success" || !data?.data?.account_name) {
    throw new Error(data?.message || "Account details could not be verified");
  }
  return {
    account_number: String(data.data.account_number || accountNumber),
    account_name: String(data.data.account_name),
  };
}
