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
        {children}
        <ViewCashBackNavigation />
        <CurrentPlanCard />
        <ActivationLevelGate />
      </body>
    </html>
  );
}
