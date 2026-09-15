"use client";

import { useEffect, useRef, useState } from "react";

type MonetagResult = { reward_event_type?: string };

declare global {
  interface Window {
    [key: `show_${string}`]: ((options?: Record<string, unknown>) => Promise<MonetagResult>) | undefined;
  }
}

const DEFAULT_MONETAG_ZONE = "11801942";
const REQUIRED_VIEW_SECONDS = 15;

export default function MonetagWatch({ initData }: { initData: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const watchActiveRef = useRef(false);
  const backGuardRef = useRef(false);
  const activeSessionRef = useRef<{ sessionId: string; requestVar: string; ymid: string } | null>(null);
  const watchStartedAtRef = useRef(0);
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

  const cancelActiveSession = async () => {
    const session = activeSessionRef.current;
    if (!session || !initData) return;
    activeSessionRef.current = null;
    await fetch("/api/ads/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, request_var: session.requestVar, ymid: session.ymid }),
      cache: "no-store",
    }).catch(() => null);
  };

  useEffect(() => {
    const handleBack = () => {
      if (!watchActiveRef.current) return;
      if (backGuardRef.current) return;
      backGuardRef.current = true;
      void cancelActiveSession();
      window.history.pushState({ viewcashAdGuard: true }, "", window.location.href);
      setMessage("Please complete the full 15-second ad to receive your reward.");
      window.setTimeout(() => {
        backGuardRef.current = false;
      }, 100);
    };

    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, [initData]);

  const creditImmediately = async (session: { sessionId: string; requestVar: string; ymid: string }) => {
    const response = await fetch("/api/ads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, session_id: session.sessionId, request_var: session.requestVar, ymid: session.ymid }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Your reward could not be credited yet.");
    return Number(data.reward_coins || 0);
  };

  const watch = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    if (!zone) return setMessage("Ads are being configured.");
    const show = window[`show_${zone}`];
    if (!show) return setMessage("Ad is not ready yet. Please try again.");

    setBusy(true);
    watchActiveRef.current = true;
    watchStartedAtRef.current = Date.now();
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

      activeSessionRef.current = { sessionId: session.session_id, requestVar: session.request_var, ymid: session.ymid };
      const result = await show({ type: "end", ymid: session.ymid, requestVar: session.request_var, catchIfNoFeed: true });
      const elapsedSeconds = (Date.now() - watchStartedAtRef.current) / 1000;

      if (elapsedSeconds < REQUIRED_VIEW_SECONDS) {
        await cancelActiveSession();
        setMessage("Ad was not completed. Watch the full 15 seconds to receive your reward.");
        return;
      }

      if (String(result?.reward_event_type || "").toLowerCase() !== "valued") {
        await cancelActiveSession();
        setMessage("Ad completed, but Monetag did not confirm a reward for this view.");
        return;
      }

      const completedSession = activeSessionRef.current;
      if (!completedSession) {
        setMessage("Ad completed, but the session was cancelled.");
        return;
      }

      const rewardCoins = await creditImmediately(completedSession);
      activeSessionRef.current = null;
      setMessage(rewardCoins > 0 ? `Reward added: ${rewardCoins} coins.` : "Ad completed. Reward already credited.");
      window.dispatchEvent(new CustomEvent("viewcash:wallet-updated"));
      // The parent dashboard currently does not subscribe to the wallet event.
      // Reload after a successful credit so the freshly credited wallet is shown immediately.
      if (rewardCoins > 0) window.setTimeout(() => window.location.reload(), 150);
    } catch (error) {
      await cancelActiveSession();
      setMessage(error instanceof Error ? error.message : "The ad could not be completed.");
    } finally {
      watchActiveRef.current = false;
      setBusy(false);
      if (window.history.state?.viewcashAdGuard) window.history.back();
    }
  };

  return (
    <div className="mt-3">
      <button onClick={watch} disabled={busy || !ready} className="w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.12)] disabled:opacity-50">
        {busy ? "Watching ad..." : !zone ? "Ads being configured" : !ready ? "Loading ad..." : "Watch Ad"}
      </button>
      {message && <p className="mt-3 rounded-2xl bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-slate-400">{message}</p>}
    </div>
  );
}
