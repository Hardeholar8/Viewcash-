import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function adminOk(req: NextRequest, secret: string) {
  const raw = req.cookies.get("viewcash_admin")?.value;
  if (!raw) return false;
  const [id, timestamp, signature] = raw.split(".");
  if (!id || !timestamp || !signature || !/^[0-9]+$/.test(id) || !/^[0-9]+$/.test(timestamp)) return false;
  const age = Date.now() - Number(timestamp);
  if (age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${timestamp}`).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function db(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !adminOk(req, key)) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const validUrl = (v: string) => !v || /^https:\/\//i.test(v);

export async function GET(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const { data, error } = await supabase.from("settings").select("key,value").in("key", ["community_popup_enabled", "community_group_url", "community_channel_url"]);
  if (error) return NextResponse.json({ error: "COMMUNITY_POPUP_LOAD_ERROR" }, { status: 500 });
  const raw: Record<string, any> = {};
  for (const row of data || []) raw[row.key] = row.value;
  return NextResponse.json({
    enabled: raw.community_popup_enabled?.value === true,
    group_url: text(raw.community_group_url?.url),
    channel_url: text(raw.community_channel_url?.url),
  });
}

export async function POST(req: NextRequest) {
  const supabase = db(req);
  if (!supabase) return NextResponse.json({ error: "ADMIN_ACCESS_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const enabled = body?.enabled === true;
  const groupUrl = text(body?.group_url);
  const channelUrl = text(body?.channel_url);
  if (!validUrl(groupUrl) || !validUrl(channelUrl)) return NextResponse.json({ error: "LINKS_MUST_USE_HTTPS" }, { status: 400 });
  const { error } = await supabase.from("settings").upsert([
    { key: "community_popup_enabled", value: { value: enabled } },
    { key: "community_group_url", value: { url: groupUrl } },
    { key: "community_channel_url", value: { url: channelUrl } },
  ], { onConflict: "key" });
  if (error) return NextResponse.json({ error: "COMMUNITY_POPUP_SAVE_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
