import { NextResponse } from "next/server";
import { getNigeriaBanks } from "@/lib/flutterwave";

let cachedBanks: { code: string; name: string }[] | null = null;
let cachedAt = 0;

export async function GET() {
  try {
    if (cachedBanks && Date.now() - cachedAt < 10 * 60 * 1000) {
      return NextResponse.json({ banks: cachedBanks });
    }
    cachedBanks = await getNigeriaBanks();
    cachedAt = Date.now();
    return NextResponse.json({ banks: cachedBanks });
  } catch (error) {
    console.error("ViewCash bank list error", error);
    return NextResponse.json({ error: "Unable to load banks" }, { status: 502 });
  }
}
