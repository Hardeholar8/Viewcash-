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
        <Script id="viewcash-admin-fraud-navigation" strategy="afterInteractive">
          {`document.addEventListener("click",function(e){var t=e.target;var b=t&&t.closest?t.closest("button"):null;if(!b||!b.textContent)return;var x=b.textContent.trim();if(location.pathname==="/admin"&&x==="Fraud / Risk"){e.preventDefault();location.assign("/admin/fraud");return}if(location.pathname==="/admin"&&x==="Tasks"){e.preventDefault();location.assign("/admin/tasks");return}if(location.pathname==="/"&&x==="Tasks"){e.preventDefault();location.assign("/tasks");return}if(location.pathname==="/"){var p=b.parentElement&&b.parentElement.parentElement?b.parentElement.parentElement.innerText:"";if(x==="Withdraw"){e.preventDefault();location.assign("/withdraw?wallet="+(p&&/Affiliate Wallet/i.test(p)?"affiliate":"tasks"));}},true);`}
        </Script>
        {children}
        <ViewCashBackNavigation />
        <CurrentPlanCard />
        <ActivationLevelGate />
      </body>
    </html>
  );
}
