import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://glkpxyanjsktmwkvvsxt.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
function tgUser(initData: string) {
  const p = new URLSearchParams(initData), hash = p.get("hash"); if (!hash || !BOT_TOKEN) return null; p.delete("hash");
  const check = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calc = crypto.createHmac("sha256",secret).update(check).digest("hex");
  if (hash.length !== calc.length || !crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(calc))) return null;
  try { return JSON.parse(p.get("user") || "{}").id as number | undefined; } catch { return null; }
}
export async function POST(req: Request) {
  try {
    const body=await req.json().catch(()=>({})); const telegramId=tgUser(String(body?.initData||"")); const requestId=String(body?.request_id||"").trim();
    if(!telegramId||!requestId||!SERVICE_ROLE_KEY) return NextResponse.json({ok:false,error:"INVALID_REQUEST"},{status:400});
    const db=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:user}=await db.from("users").select("id").eq("telegram_id",telegramId).maybeSingle(); if(!user) return NextResponse.json({ok:false,error:"USER_NOT_FOUND"},{status:404});
    const {data:tx}=await db.from("transactions").select("amount").eq("user_id",user.id).eq("reference",`adsgalaxy:${requestId}`).maybeSingle();
    return NextResponse.json({ok:true,credited:Boolean(tx),reward_coins:Number(tx?.amount||0)});
  } catch { return NextResponse.json({ok:false,error:"STATUS_CHECK_FAILED"},{status:500}); }
}
