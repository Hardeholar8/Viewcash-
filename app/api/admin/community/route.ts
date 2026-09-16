import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function db(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!url || !key || !raw) return null;
  const [id, timestamp, signature] = raw.split(".");
  if (!id || !timestamp || !signature || !/^\d+$/.test(id) || !/^\d+$/.test(timestamp)) return null;
  const age = Date.now() - Number(timestamp);
  if (age < 0 || age > 8 * 60 * 60 * 1000) return null;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}`).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
const getUrl = (v: unknown) => String(v || "").trim();
export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const { data, error } = await supabase.from("settings").select("key,value").in("key", ["community_channel_url","community_group_url","community_popup_enabled"]);
  if (error) return NextResponse.json({ error: "COMMUNITY_SETTINGS_ERROR" }, { status: 500 });
  const out: Record<string, unknown> = { community_channel_url: "", community_group_url: "", community_popup_enabled: true };
  for (const row of data || []) {
    if (row.key === "community_channel_url") out.community_channel_url = row.value?.url || "";
    if (row.key === "community_group_url") out.community_group_url = row.value?.url || "";
    if (row.key === "community_popup_enabled") out.community_popup_enabled = row.value?.value !== false;
  }
  return NextResponse.json(out);
}
export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const rows = [
    { key: "community_channel_url", value: { url: getUrl(body?.community_channel_url) } },
    { key: "community_group_url", value: { url: getUrl(body?.community_group_url) } },
    { key: "community_popup_enabled", value: { value: body?.community_popup_enabled !== false } },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "COMMUNITY_SETTINGS_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
