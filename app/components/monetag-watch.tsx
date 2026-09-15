"use client";

import { useEffect, useState } from "react";

type MonetagResult = { reward_event_type?: string };

declare global {
  interface Window {
    [key: `show_${string}`]: ((options?: Record<string, unknown>) => Promise<MonetagResult>) | undefined;
  }
}

const DEFAULT_MONETAG_ZONE = "11801942";

export default function MonetagWatch({ initData }: { initData: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const zone = process.env.NEXT_PUBLIC_MONETAG_ZONE_ID?.trim() || DEFAULT_MONETAG_ZONE;

  useEffect(() => {
    if (!zone) return;
    const src = "https://libtl.com/sdk.js";
    if (document.querySelector(`script[data-viewcash-monetag="${zone}"]`)) {
      const timer = window.setInterval(() => {
        if (typeof window[`show_${zone}`] === "function") {
          setReady(true);
          window.clearInterval(timer);
        }
      }, 250);
      return () => window.clearInterval(timer);
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.zone = zone;
    script.dataset.sdk = `show_${zone}`;
    script.dataset.viewcashMonetag = zone;
    script.onload = () => setReady(typeof window[`show_${zone}`] === "function");
    document.head.appendChild(script);
    const timer = window.setInterval(() => {
      if (typeof window[`show_${zone}`] === "function") {
        setReady(true);
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [zone]);

  const watch = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    if (!zone) return setMessage("Ads are being configured.");
    const show = window[`show_${zone}`];
    if (!show) return setMessage("Ad is not ready yet. Please try again.");
    setBusy(true);
    setMessage("");
    try {
      const sessionResponse = await fetch("/api/ads/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        cache: "no-store",
      });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) throw new Error(session.error || "Unable to start ad.");
      const result = await show({
        type: "end",
        ymid: session.ymid,
        requestVar: session.request_var,
        catchIfNoFeed: true,
      });
      if (result?.reward_event_type === "valued") {
        setMessage("Ad completed. Your coins will be credited after server confirmation.");
      } else {
        setMessage("Ad completed, but it was not a paid event. No coins were added.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The ad could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <button onClick={watch} disabled={busy || !ready} className="w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.12)] disabled:opacity-50">
        {busy ? "Loading ad..." : !zone ? "Ads being configured" : !ready ? "Loading ad..." : "Watch Ad"}
      </button>
      {message && <p className="mt-3 rounded-2xl bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-slate-400">{message}</p>}
    </div>
  );
}
