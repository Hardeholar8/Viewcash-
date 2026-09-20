import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { sendRedemptionMessage } from "@/lib/telegram-redemption";

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://glkpxyanjsktmwkvvsxt.supabase.co";
function tg(initData:string,token:string){const p=new URLSearchParams(initData);const h=p.get("hash");if(!h)return null;p.delete("hash");const s=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");const key=crypto.createHmac("sha256","WebAppData").update(token.trim()).digest();const calc=crypto.createHmac("sha256",key).update(s).digest("hex");if(h.length!==calc.length||!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(calc)))return null;try{return JSON.parse(p.get("user")||"{}") as {id?:number}}catch{return null}}

export async function POST(req:NextRequest){
 try{
  const b=await req.json().catch(()=>({})); const token=process.env.TELEGRAM_REDEMPTION_BOT_TOKEN, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const u=tg(String(b.initData||""),token||""); const mb=Math.floor(Number(b.amount_mb||0)); const phone=String(b.phone_number||"").replace(/\D/g,"");
  const type=b.balance_type==="referral"?"referral":"tasks";
  if(!token||!key)return NextResponse.json({error:"SERVER_CONFIG_ERROR"},{status:500});
  if(!u?.id)return NextResponse.json({error:"INVALID_TELEGRAM_SESSION"},{status:401});
  if(!/^\d{11}$/.test(phone)||!/^0?234/.test(phone)&&!/^08|^07|^09/.test(phone))return NextResponse.json({error:"Enter a valid Nigerian MTN phone number."},{status:400});
  const db=createClient(SUPABASE_URL,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:minSetting}=await db.from("settings").select("value").eq("key","minimum_data_redemption_mb").maybeSingle();
  const minimumMb=Math.max(1,Math.floor(Number((minSetting?.value as {amount?:number}|null)?.amount||100)));
  if(mb<minimumMb)return NextResponse.json({error:`Minimum data redemption is ${minimumMb} MB.`},{status:400});
  const {data:user}=await db.from("users").select("id,status,redemption_override,redemption_unlocked").eq("telegram_id",u.id).maybeSingle();
  if(!user)return NextResponse.json({error:"USER_NOT_FOUND"},{status:404});
  if(user.status!=="active")return NextResponse.json({error:"ACCOUNT_NOT_ACTIVE"},{status:403});
  if(!user.redemption_override && !user.redemption_unlocked){
   const { count: qualifiedReferrals } = await db.from("referrals").select("id",{count:"exact",head:true}).eq("referrer_id",user.id).eq("status","qualified");
   if(Number(qualifiedReferrals||0) < 10) return NextResponse.json({error:`Redeem Data is locked. Complete the referral requirement first: ${Number(qualifiedReferrals||0)}/10 qualified referrals.`},{status:403});
  }
  const {data:wallet}=await db.from("wallets").select("balance,referral_balance").eq("user_id",user.id).maybeSingle();
  if(!wallet)return NextResponse.json({error:"WALLET_NOT_FOUND"},{status:404});
  const available=type==="referral"?Number(wallet.referral_balance||0):Number(wallet.balance||0);
  if(mb>available)return NextResponse.json({error:`Insufficient data balance. Available: ${available>=1024?(available/1024).toFixed(2)+" GB":available+" MB"}.`},{status:400});
  const {data:pending}=await db.from("data_redemptions").select("id").eq("user_id",user.id).eq("status","pending").maybeSingle();
  if(pending)return NextResponse.json({error:"You already have a pending data redemption."},{status:409});
  const {data:red,error}=await db.from("data_redemptions").insert({user_id:user.id,network:"MTN",phone_number:phone,amount_mb:mb,balance_type:type,status:"pending"}).select("id,network,phone_number,amount_mb,status").single();
  if(error)throw error;
  const { count: redemptionCount } = await db.from("data_redemptions").select("id",{count:"exact",head:true}).eq("user_id",user.id);
  const { data: profile } = await db.from("users").select("username,first_name").eq("id",user.id).maybeSingle();
  try { const message = await sendRedemptionMessage({id:String(red.id),username:profile?.username,firstName:profile?.first_name,amountMb:mb,network:"MTN",phoneNumber:phone,redemptionNumber:Number(redemptionCount||1)}); if(message?.message_id) await db.from("data_redemptions").update({telegram_message_id:message.message_id}).eq("id",red.id); } catch (telegramError) { console.error("Telegram redemption notification failed:", telegramError); }
  const update=type==="referral"?{referral_balance:available-mb}:{balance:available-mb};
  const {error:walletError}=await db.from("wallets").update(update).eq("user_id",user.id);
  if(walletError){await db.from("data_redemptions").delete().eq("id",red.id);throw walletError}
  return NextResponse.json({ok:true,redemption:red,message:"MTN data redemption submitted. Your request is pending fulfillment."});
 }catch(e){console.error(e);return NextResponse.json({error:"Unable to submit data redemption right now."},{status:500})}
}