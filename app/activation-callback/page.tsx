"use client";

import { useEffect, useState } from "react";

export default function ActivationCallbackPage() {
  const [message, setMessage] = useState("Confirming your payment...");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const run = async () => {
      const tg = window.Telegram?.WebApp;
      const params = new URLSearchParams(window.location.search);
      const txRef = params.get("tx_ref") || params.get("tx_ref") || "";
      const transactionId = params.get("transaction_id") || "";
      if (!tg?.initData) {
        setMessage("Please open ViewCash from Telegram and try again.");
        return;
      }
      if (!txRef && !transactionId) {
        setMessage("No payment reference was returned. Please contact support if you were charged.");
        return;
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch("/api/account/activate/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg.initData, tx_ref: txRef || undefined, transaction_id: transactionId || undefined }),
            cache: "no-store",
          });
          const data = await r.json().catch(() => ({}));
          if (r.ok && data.activated) {
            setOk(true);
            setMessage("Payment confirmed. Your ViewCash account is now active.");
            return;
          }
          if (data.payment_status === "pending") {
            setMessage("Payment is still being confirmed...");
            await new Promise((resolve) => setTimeout(resolve, 2500));
            continue;
          }
          setMessage(data.error || "Payment verification failed.");
          return;
        } catch {
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      setMessage("We could not confirm the payment yet. Please return to ViewCash and try again shortly.");
    };
    run();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-[#0b1020] px-5 py-20 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/[.04] p-7 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/10 text-2xl">{ok ? "✓" : "…"}</div>
        <h1 className="mt-5 text-2xl font-bold">{ok ? "Account Activated" : "Activating ViewCash"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
        <button onClick={() => window.location.assign("/")} className="mt-6 w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950">Open ViewCash</button>
      </div>
    </main>
  );
}
