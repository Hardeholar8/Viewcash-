import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://glkpxyanjsktmwkvvsxt.supabase.co";

export async function GET(_req: NextRequest) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
    const db = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await db.from("activation_levels").select("level,name,activation_fee").eq("active", true).order("level", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ levels: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ViewCash activation levels error", error);
    return NextResponse.json({ error: "Unable to load activation options." }, { status: 500 });
  }
}
