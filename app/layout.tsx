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
          {`document.addEventListener("click",function(e){var t=e.target;var b=t&&t.closest?t.closest("button"):null;if(!b||!b.textContent)return;var x=b.textContent.replace(/\\s+/g," ").trim();if(location.pathname==="/admin"&&x==="Fraud / Risk"){e.preventDefault();e.stopImmediatePropagation();location.assign("/admin/fraud");return}if(location.pathname==="/admin"&&x==="Tasks"){e.preventDefault();e.stopImmediatePropagation();location.assign("/admin/tasks");return}if(location.pathname==="/"){if(/^Tasks$/i.test(x)){e.preventDefault();e.stopImmediatePropagation();location.assign("/tasks");return}if(x==="Withdraw"){var p=b.parentElement;var wallet="tasks";for(var i=0;i<5&&p;i++){var text=(p.innerText||"").replace(/\\s+/g," ").trim();if(/Affiliate Wallet/i.test(text)&&!/Task Wallet/i.test(text)){wallet="affiliate";break}if(/Task Wallet/i.test(text)&&!/Affiliate Wallet/i.test(text)){wallet="tasks";break}p=p.parentElement}e.preventDefault();e.stopImmediatePropagation();location.assign("/withdraw?wallet="+wallet);return}},true);`}
        </Script>
        {children}
        <ViewCashBackNavigation />
        <CurrentPlanCard />
        <ActivationLevelGate />
      </body>
    </html>
  );
}
