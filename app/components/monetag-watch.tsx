"use client";

import { useEffect, useRef, useState } from "react";

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
  const watchActiveRef = useRef(false);
  const backGuardRef = useRef(false);
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

  // Keep the user on the Watch Ad page while an ad is running. If the phone
  // Back button fires before the ad is completed, restore the current history
  // entry instead of navigating away. This never credits a reward.
  useEffect(() => {
    const handleBack = () => {
      if (!watchActiveRef.current) return;
      if (backGuardRef.current) return;
      backGuardRef.current = true;
      window.history.pushState({ viewcashAdGuard: true }, "", window.location.href);
      setMessage("Please finish the ad to receive your reward.");
      window.setTimeout(() => {
        backGuardRef.current = false;
      }, 100);
    };

    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const waitForConfirmation = async (requestVar: string, ymid: string) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 1200 : 1000));
      const r = await fetch("/api/ads/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, request_var: requestVar, ymid }),
        cache: "no-store",
      }).catch(() => null);
      const d = await r?.json().catch(() => ({}));
      if (r?.ok && d?.confirmed) {
        window.location.reload();
        return true;
      }
    }
    return false;
  };

  const watch = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    if (!zone) return setMessage("Ads are being configured.");
    const show = window[`show_${zone}`];
    if (!show) return setMessage("Ad is not ready yet. Please try again.");
    setBusy(true);
    watchActiveRef.current = true;
    // Add a same-page history entry so the phone Back action can be consumed
    // while the rewarded ad is active.
    window.history.pushState({ viewcashAdGuard: true }, "", window.location.href);
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
        setMessage("Ad completed. Confirming your coins...");
        const confirmed = await waitForConfirmation(session.request_var, session.ymid);
        if (!confirmed) setMessage("Ad completed. The server is still waiting for the partner confirmation. Your coins will only be added after confirmation.");
      } else {
        setMessage("Ad completed, but it was not a paid event. No coins were added.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The ad could not be completed.");
    } finally {
      watchActiveRef.current = false;
      setBusy(false);
      // Remove the guard history entry without navigating away from the page.
      if (window.history.state?.viewcashAdGuard) {
        window.history.back();
      }
    }
  };

  return (
    <div className="mt-3">
      <button onClick={watch} disabled={busy || !ready} className="w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.12)] disabled:opacity-50">
        {busy ? "Confirming reward..." : !zone ? "Ads being configured" : !ready ? "Loading ad..." : "Watch Ad"}
      </button>
      {message && <p className="mt-3 rounded-2xl bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-slate-400">{message}</p>}
    </div>
  );
}
