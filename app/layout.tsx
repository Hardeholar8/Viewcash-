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
var go=function(path){try{window.location.assign(path)}catch(e){window.location.href=path}};
var clean=function(v){return String(v||"").replace(/\\s+/g," ").trim()};
var route=function(e){
 var t=e.target,b=t&&t.closest?t.closest("button"):null;
 if(!b)return;
 var x=clean(b.innerText||b.textContent);
 var path=window.location.pathname;
 if(path==="/admin"&&x==="Fraud / Risk"){e.preventDefault();e.stopImmediatePropagation();go("/admin/fraud");return}
 if(path==="/admin"&&x==="Tasks"){e.preventDefault();e.stopImmediatePropagation();go("/admin/tasks");return}
 if(path!=="/")return;
 if(/^Tasks$/i.test(x)){
   e.preventDefault();e.stopImmediatePropagation();go("/tasks");return;
 }
 if(x==="Withdraw"){
   var p=b.parentElement,wallet="tasks";
   for(var i=0;i<7&&p;i++){
     var text=clean(p.innerText);
     if(/Affiliate Wallet/i.test(text)&&!/Task Wallet/i.test(text)){wallet="affiliate";break}
     if(/Task Wallet/i.test(text)&&!/Affiliate Wallet/i.test(text)){wallet="tasks";break}
     p=p.parentElement;
   }
   e.preventDefault();e.stopImmediatePropagation();go("/withdraw?wallet="+wallet);return;
 }
};
["pointerdown","touchstart","click"].forEach(function(name){document.addEventListener(name,route,true)});
var mark=function(){
 if(window.location.pathname!=="/")return;
 document.querySelectorAll("button").forEach(function(b){
   var x=clean(b.innerText||b.textContent);
   if(/^Tasks$/i.test(x))b.setAttribute("data-viewcash-route","/tasks");
   if(x==="Withdraw")b.setAttribute("data-viewcash-route","/withdraw");
 });
};
new MutationObserver(mark).observe(document.documentElement,{subtree:true,childList:true});
mark();
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
