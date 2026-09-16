"use client";

import { useEffect, useRef, useState } from "react";

type MonetagResult = { reward_event_type?: string };
type AdsGalaxyResult = { request_id?: string; [key: string]: unknown };

declare global {
  interface Window {
    [key: `show_${string}`]: ((options?: Record<string, unknown>) => Promise<MonetagResult>) | undefined;
    showAdsGalaxy?: () => Promise<AdsGalaxyResult>;
  }
}

const DEFAULT_MONETAG_ZONE = "11801942";
const REQUIRED_VIEW_SECONDS = 15;
const ADS_GALAXY_SCRIPT = "https://app.adsgalaxy.online/sdk.js?id=92";

export default function MonetagWatch({ initData }: { initData: string }) {
  const [ready, setReady] = useState(false);
  const [adsGalaxyReady, setAdsGalaxyReady] = useState(false);
  const [busy, setBusy] = useState<"monetag" | "adsgalaxy" | null>(null);
  const [message, setMessage] = useState("");
  const watchActiveRef = useRef(false);
  const backGuardRef = useRef(false);
  const activeSessionRef = useRef<{ sessionId: string; requestVar: string; ymid: string } | null>(null);
  const watchStartedAtRef = useRef(0);
  const rewardTimerRef = useRef<number | null>(null);
  const rewardPromiseRef = useRef<Promise<number> | null>(null);
  const zone = process.env.NEXT_PUBLIC_MONETAG_ZONE_ID?.trim() || DEFAULT_MONETAG_ZONE;

  useEffect(() => {
    if (!zone) return;
    const src = "https://libtl.com/sdk.js";
    if (document.querySelector(`script[data-viewcash-monetag="${zone}"]`)) {
      const timer = window.setInterval(() => {
        if (typeof window[`show_${zone}`] === "function") {
          setReady(true); window.clearInterval(timer);
        }
      }, 250);
      return () => window.clearInterval(timer);
    }
    const script = document.createElement("script");
    script.src = src; script.async = true; script.dataset.zone = zone;
    script.dataset.sdk = `show_${zone}`; script.dataset.viewcashMonetag = zone;
    script.onload = () => setReady(typeof window[`show_${zone}`] === "function");
    document.head.appendChild(script);
    const timer = window.setInterval(() => {
      if (typeof window[`show_${zone}`] === "function") { setReady(true); window.clearInterval(timer); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [zone]);

  useEffect(() => {
    if (window.showAdsGalaxy) { setAdsGalaxyReady(true); return; }
    const existing = document.querySelector(`script[src="${ADS_GALAXY_SCRIPT}"]`);
    if (existing) {
      const timer = window.setInterval(() => {
        if (window.showAdsGalaxy) { setAdsGalaxyReady(true); window.clearInterval(timer); }
      }, 250);
      return () => window.clearInterval(timer);
    }
    const script = document.createElement("script");
    script.src = ADS_GALAXY_SCRIPT; script.async = true;
    script.onload = () => setAdsGalaxyReady(typeof window.showAdsGalaxy === "function");
    script.onerror = () => setMessage("Ads Galaxy could not be loaded. Please try again.");
    document.head.appendChild(script);
    const timer = window.setInterval(() => {
      if (window.showAdsGalaxy) { setAdsGalaxyReady(true); window.clearInterval(timer); }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const cancelActiveSession = async () => {
    const session = activeSessionRef.current;
    if (!session || !initData) return;
    activeSessionRef.current = null;
    await fetch("/api/ads/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, request_var: session.requestVar, ymid: session.ymid }), cache: "no-store",
    }).catch(() => null);
  };

  useEffect(() => {
    const handleBack = () => {
      if (!watchActiveRef.current || backGuardRef.current) return;
      backGuardRef.current = true; void cancelActiveSession();
      window.history.pushState({ viewcashAdGuard: true }, "", window.location.href);
      setMessage("Please complete the full 15-second ad to receive your reward.");
      window.setTimeout(() => { backGuardRef.current = false; }, 100);
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, [initData]);

  const creditMonetag = async (session: { sessionId: string; requestVar: string; ymid: string }) => {
    const response = await fetch("/api/ads/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, session_id: session.sessionId, request_var: session.requestVar, ymid: session.ymid }), cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Your reward could not be credited yet.");
    return Number(data.reward_coins || 0);
  };

  const watchMonetag = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    const show = window[`show_${zone}`];
    if (!show) return setMessage("Monetag ad is not ready yet. Please try again.");
    setBusy("monetag"); watchActiveRef.current = true; watchStartedAtRef.current = Date.now();
    window.history.pushState({ viewcashAdGuard: true }, "", window.location.href); setMessage("");
    try {
      const sessionResponse = await fetch("/api/ads/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }), cache: "no-store" });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) throw new Error(session.error || "Unable to start ad.");
      activeSessionRef.current = { sessionId: session.session_id, requestVar: session.request_var, ymid: session.ymid };
      const activeSession = activeSessionRef.current;
      rewardPromiseRef.current = new Promise<number>((resolve, reject) => {
        rewardTimerRef.current = window.setTimeout(async () => {
          if (!watchActiveRef.current || !activeSessionRef.current) return reject(new Error("AD_CANCELLED"));
          try { const reward = await creditMonetag(activeSession); activeSessionRef.current = null; resolve(reward); }
          catch (e) { reject(e); }
        }, REQUIRED_VIEW_SECONDS * 1000);
      });
      const result = await show({ type: "end", ymid: session.ymid, requestVar: session.request_var, catchIfNoFeed: true });
      if ((Date.now() - watchStartedAtRef.current) / 1000 < REQUIRED_VIEW_SECONDS) {
        await cancelActiveSession(); setMessage("Ad was not completed. Watch the full 15 seconds to receive your reward."); return;
      }
      const reward = await rewardPromiseRef.current;
      setMessage(reward > 0 ? `Reward added: ${reward} coins.` : "Ad completed. Reward already credited.");
      window.dispatchEvent(new CustomEvent("viewcash:wallet-updated"));
    } catch (error) {
      if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = null; rewardPromiseRef.current = null; await cancelActiveSession();
      setMessage(error instanceof Error ? error.message : "The Monetag ad could not be completed.");
    } finally {
      watchActiveRef.current = false; setBusy(null);
      if (rewardTimerRef.current !== null) window.clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = null; rewardPromiseRef.current = null;
      if (window.history.state?.viewcashAdGuard) window.history.back();
    }
  };

  const watchAdsGalaxy = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    if (!window.showAdsGalaxy) return setMessage("Ads Galaxy is not ready yet. Please try again.");
    setBusy("adsgalaxy"); setMessage("");
    try {
      const result = await window.showAdsGalaxy();
      const requestId = String(result?.request_id || "").trim();
      if (!requestId) throw new Error("Ads Galaxy completed without a request ID.");
      const response = await fetch("/api/ads-galaxy/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, request_id: requestId }), cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Ads Galaxy reward could not be credited yet.");
      const reward = Number(data.reward_coins || 0);
      setMessage(reward > 0 ? `Reward added: ${reward} coins.` : "Ad completed. Reward already credited.");
      window.dispatchEvent(new CustomEvent("viewcash:wallet-updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Ads Galaxy ad could not be completed.");
    } finally { setBusy(null); }
  };

  return <div className="mt-3 space-y-2.5">
    <button onClick={watchMonetag} disabled={busy !== null || !ready} className="w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.12)] disabled:opacity-50">
      {busy === "monetag" ? "Watching ad..." : !ready ? "Loading Monetag..." : "Watch Ad — Monetag"}
    </button>
    <button onClick={watchAdsGalaxy} disabled={busy !== null || !adsGalaxyReady} className="w-full rounded-2xl bg-emerald-400 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(52,211,153,0.12)] disabled:opacity-50">
      {busy === "adsgalaxy" ? "Watching ad..." : !adsGalaxyReady ? "Loading Ads Galaxy..." : "Watch Ad — Ads Galaxy"}
    </button>
    {message && <p className="rounded-2xl bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-slate-400">{message}</p>}
  </div>;
}
