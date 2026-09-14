import { NextRequest, NextResponse } from "next/server";
import { resolveNigeriaAccount } from "@/lib/flutterwave";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const accountNumber = String(body?.account_number || "").replace(/\D/g, "");
    const bankCode = String(body?.bank_code || "").trim();

    if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
      return NextResponse.json({ error: "INVALID_ACCOUNT_DETAILS" }, { status: 400 });
    }

    const account = await resolveNigeriaAccount(accountNumber, bankCode);
    return NextResponse.json({ ok: true, ...account });
  } catch (error) {
    console.error("ViewCash account verification error", error);
    return NextResponse.json({ error: "ACCOUNT_NOT_VERIFIED" }, { status: 422 });
  }
}
