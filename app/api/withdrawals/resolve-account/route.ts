import { NextRequest, NextResponse } from "next/server";
import { getNigeriaBanks, resolveNigeriaAccount } from "@/lib/flutterwave";

export const dynamic = "force-dynamic";

type Bank = { code: string; name: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const bankName = String(body?.bank_name || "").trim();
    const accountNumber = String(body?.account_number || "").trim();

    if (!bankName || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: "ENTER_BANK_AND_10_DIGIT_ACCOUNT" }, { status: 400 });
    }

    const banks: Bank[] = await getNigeriaBanks();
    const bank = banks.find((item: Bank) => item.name.toLowerCase() === bankName.toLowerCase());
    if (!bank) {
      return NextResponse.json({ error: "BANK_NOT_FOUND" }, { status: 400 });
    }

    const verified = await resolveNigeriaAccount(accountNumber, bank.code);
    return NextResponse.json({
      account_name: verified.account_name,
      account_number: verified.account_number,
      bank_name: bank.name,
      bank_code: bank.code,
    });
  } catch (error) {
    console.error("ViewCash account resolve error", error);
    return NextResponse.json({ error: "ACCOUNT_NOT_VERIFIED" }, { status: 422 });
  }
}
