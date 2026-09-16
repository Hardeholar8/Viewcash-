import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ enabled: false }, { status: 200 });

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", ["community_popup_enabled", "community_group_url", "community_channel_url"]);

  if (error) return NextResponse.json({ enabled: false }, { status: 200 });

  const settings: Record<string, any> = {};
  for (const row of data || []) settings[row.key] = row.value;

  return NextResponse.json({
    enabled: settings.community_popup_enabled?.value === true,
    group_url: typeof settings.community_group_url?.url === "string" ? settings.community_group_url.url : "",
    channel_url: typeof settings.community_channel_url?.url === "string" ? settings.community_channel_url.url : "",
  }, { headers: { "Cache-Control": "no-store" } });
}
