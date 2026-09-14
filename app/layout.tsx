import type { Metadata } from "next";
import Script from "next/script";
import WithdrawalAccountVerification from "./components/withdrawal-account-verification";
import "./globals.css";

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
          {`document.addEventListener("click",function(e){if(location.pathname!=="/admin")return;var t=e.target;var b=t&&t.closest?t.closest("button"):null;if(b&&b.textContent&&b.textContent.trim()==="Fraud / Risk"){e.preventDefault();location.assign("/admin/fraud");}},true);`}
        </Script>
        <WithdrawalAccountVerification />
        {children}
      </body>
    </html>
  );
}
