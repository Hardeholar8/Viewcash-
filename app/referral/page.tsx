"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Gift, Users, Wallet } from "lucide-react";

type Session = {
  referral_link?: string;
  referral_code?: string;
  referral_coins?: number;
  referred_count?: number;
  activated_referral_count?: number;
  activated?: boolean;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready: () => void; expand: () => void } };
  }
}

export default function ReferralPage() {
  const [data, setData] = useState<Session>({});
  const [status, setStatus] = useState("Loading referral details...");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const tg = window.Telegram?.WebApp;
      const initData = tg?.initData?.trim();
      if (!tg || !initData) {
        setStatus("Open ViewCash from Telegram to view your referral details.");
        return;
      }
      try {
        tg.ready();
        tg.expand();
        const response = await fetch("/api/telegram/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to load referral details.");
        if (!cancelled) {
          setData(result);
          setStatus("");
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to load referral details.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const copyLink = async () => {
    if (!data.referral_link) return;
    try {
      await navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus("Copy failed. Long-press the referral link to copy it.");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-md bg-[#070b14] px-4 pb-10 pt-5 text-slate-100 shadow-2xl">
      <header className="flex items-center gap-3">
        <button onClick={() => window.location.assign("/")} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.04]">
          <ArrowLeft size={19} />
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">ViewCash</p>
          <h1 className="text-2xl font-black">Referral</h1>
        </div>
      </header>

      {status ? <div className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-4 text-sm leading-6 text-slate-400">{status}</div> : (
        <>
          <section className="mt-6 rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[.12] to-white/[.025] p-5">
            <div className="flex items-center gap-2 text-cyan-300"><Wallet size={17} /><span className="text-[10px] font-bold uppercase tracking-[.18em]">Affiliate Wallet</span></div>
            <p className="mt-2 text-3xl font-black">{Number(data.referral_coins || 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">Referral commission balance</p>
            <button onClick={() => window.location.assign("/withdraw?wallet=affiliate")} className="mt-4 w-full rounded-2xl bg-cyan-400 py-3 text-sm font-extrabold text-slate-950">Withdraw Commission</button>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-white/10 bg-white/[.035] p-4"><Users size={18} className="text-cyan-300" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">People Referred</p><p className="mt-1 text-2xl font-black">{Number(data.referred_count || 0).toLocaleString()}</p></div>
            <div className="rounded-3xl border border-emerald-300/15 bg-emerald-400/[.05] p-4"><Gift size={18} className="text-emerald-300" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Activated Referrals</p><p className="mt-1 text-2xl font-black text-emerald-300">{Number(data.activated_referral_count || 0).toLocaleString()}</p></div>
          </section>

          <section className="mt-4 rounded-3xl border border-white/10 bg-white/[.035] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Invite & earn</p>
            <h2 className="mt-1 text-lg font-bold">Your referral link</h2>
            <p className="mt-3 break-all rounded-2xl bg-black/20 p-3 text-xs leading-5 text-slate-300">{data.referral_link || "Referral link unavailable"}</p>
            <button onClick={copyLink} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] py-3 text-sm font-bold"><Copy size={17} />{copied ? "Copied" : "Copy Referral Link"}</button>
            <p className="mt-3 text-xs text-slate-500">Referral code: <span className="font-bold text-slate-300">{data.referral_code || "—"}</span></p>
          </section>
        </>
      )}
    </main>
  );
}
