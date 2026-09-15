import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import ActivationLevelGate from "./components/activation-level-gate";
import ViewCashBackNavigation from "./components/viewcash-back-navigation";
import CurrentPlanCard from "./components/current-plan-card";

export const metadata: Metadata = {
  title: "ViewCash",
  description: "Watch ads, complete tasks and earn rewards.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="viewcash-navigation" strategy="afterInteractive">
          {`(function(){
var go=function(path){try{window.location.href=path}catch(e){window.location.assign(path)}};
var clean=function(v){return String(v||"").replace(/\\s+/g," ").trim()};
var route=function(b){
 if(!b)return false;
 var x=clean(b.innerText||b.textContent), path=window.location.pathname;
 if(path==="/admin"&&x==="Fraud / Risk"){go("/admin/fraud");return true}
 if(path==="/admin"&&x==="Tasks"){go("/admin/tasks");return true}
 if(path!=="/")return false;
 if(/^Tasks$/i.test(x)){go("/tasks");return true}
 if(x==="Withdraw"){
   var p=b.parentElement,wallet="tasks";
   for(var i=0;i<8&&p;i++){
     var text=clean(p.innerText);
     if(/Affiliate Wallet/i.test(text)&&!/Task Wallet/i.test(text)){wallet="affiliate";break}
     if(/Task Wallet/i.test(text)&&!/Affiliate Wallet/i.test(text)){wallet="tasks";break}
     p=p.parentElement;
   }
   go("/withdraw?wallet="+wallet);return true;
 }
 return false;
};
var wire=function(){
 if(window.location.pathname!=="/")return;
 document.querySelectorAll("button").forEach(function(b){
   var x=clean(b.innerText||b.textContent);
   if(/^Tasks$/i.test(x)||x==="Withdraw"){
     b.setAttribute("data-viewcash-route",x==="Withdraw"?"withdraw":"tasks");
     if(!b.__viewcashWired){
       b.__viewcashWired=true;
       b.onclick=function(ev){ev.preventDefault();ev.stopPropagation();route(b);};
     }
   }
 });
};
["pointerdown","touchstart","click"].forEach(function(name){document.addEventListener(name,function(e){var b=e.target&&e.target.closest?e.target.closest("button"):null;if(b&&route(b)){e.preventDefault();e.stopImmediatePropagation();}},true)});
new MutationObserver(wire).observe(document.documentElement,{subtree:true,childList:true});
wire();
})();`}
        </Script>
        <Script id="viewcash-balance-sync" strategy="afterInteractive">
          {`(function(){
var lastCoins=null,lastRef=null,started=false,timer=null;
var check=function(){
 var tg=window.Telegram&&window.Telegram.WebApp, data=tg&&tg.initData;
 if(!data)return;
 fetch("/api/telegram/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData:data}),cache:"no-store"})
 .then(function(r){return r.json().catch(function(){return {}})})
 .then(function(d){
   if(!d||d.activated===false)return;
   var coins=Number(d.coins||0), ref=Number(d.referral_coins||0);
   if(!started){lastCoins=coins;lastRef=ref;started=true;return;}
   if(coins!==lastCoins||ref!==lastRef){lastCoins=coins;lastRef=ref;window.location.reload();}
 }).catch(function(){});
};
var start=function(){if(timer)return;check();timer=window.setInterval(check,5000)};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
window.addEventListener("pageshow",check);
})();`}
        </Script>
        <Script id="viewcash-referral-stats" strategy="afterInteractive">
          {`(function(){
var timer=null,lastReferred=null,lastActivated=null;
var render=function(referred,activated){
 var headings=document.querySelectorAll("h3"),target=null;
 headings.forEach(function(h){if(clean(h.innerText||h.textContent)==="Your referral link")target=h});
 if(!target)return;
 var card=target.parentElement&&target.parentElement.parentElement;
 if(!card)return;
 var stats=card.querySelector(".viewcash-referral-stats");
 if(!stats){
   stats=document.createElement("div");
   stats.className="viewcash-referral-stats mt-4 grid grid-cols-2 gap-3";
   target.parentElement.after(stats);
 }
 stats.innerHTML='<div class="rounded-2xl border border-white/10 bg-white/[.035] p-3"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">People Referred</p><p class="mt-1 text-xl font-black text-slate-100">'+Number(referred||0).toLocaleString()+'</p></div><div class="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.05] p-3"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Activated Referrals</p><p class="mt-1 text-xl font-black text-emerald-300">'+Number(activated||0).toLocaleString()+'</p></div>';
};
var clean=function(v){return String(v||"").replace(/\\s+/g," ").trim()};
var check=function(){
 var tg=window.Telegram&&window.Telegram.WebApp,data=tg&&tg.initData;
 if(!data||window.location.pathname!=="/")return;
 fetch("/api/telegram/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData:data}),cache:"no-store"})
 .then(function(r){return r.json().catch(function(){return {}})})
 .then(function(d){
   if(!d)return;
   var referred=Number(d.referred_count||0),activated=Number(d.activated_referral_count||0);
   lastReferred=referred;lastActivated=activated;render(referred,activated);
 }).catch(function(){});
};
var start=function(){if(timer)return;check();timer=window.setInterval(check,5000)};
new MutationObserver(function(){if(lastReferred!==null)render(lastReferred,lastActivated)}).observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();`}
        </Script>
        {children}
        <ViewCashBackNavigation />
        <CurrentPlanCard />
        <ActivationLevelGate />
      </body>
    </html>
  );
}
