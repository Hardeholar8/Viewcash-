"use client";

import { useEffect, useState } from "react";
import { CirclePlay, ClipboardList, Gift, Home, Wallet, ArrowUpRight, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

const nav = [
  { label: "Home", icon: Home },
  { label: "Watch Ads", icon: CirclePlay },
  { label: "Tasks", icon: ClipboardList },
  { label: "Wallet", icon: Wallet },
  { label: "Referral", icon: Users },
];

type TelegramWebApp = { initData: string; ready: () => void; expand: () => void };

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export default function HomePage() {
  const [active, setActive] = useState("Home");
  const [watched, setWatched] = useState(0);
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      setStatus("Open ViewCash from Telegram");
      return;
    }

    webApp.ready();
    webApp.expand();

    fetch("/api/telegram/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to connect");
        setBalance(Number(data.balance || 0));
        setStatus(data.username ? `@${data.username}` : "Connected");
      })
      .catch(() => setStatus("Telegram connection pending"));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-[#0b1020] pb-24 shadow-2xl">
      <header className="px-5 pt-8 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Welcome to</p>
            <h1 className="text-2xl font-bold tracking-tight">View<span className="text-cyan-400">Cash</span></h1>
            <p className="mt-1 text-xs text-slate-500">{status}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-bold">VC</div>
        </div>
      </header>

      <section className="px-5">
        <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent p-6 shadow-lg shadow-cyan-950/30">
          <p className="text-sm text-slate-300">Available balance</p>
          <div className="mt-2 flex items-end justify-between">
            <h2 className="text-4xl font-extrabold">₦{balance.toFixed(2)}</h2>
            <Wallet className="mb-1 text-cyan-300" size={28} />
          </div>
          <button onClick={() => setActive("Wallet")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 py-3 font-bold text-slate-950 transition active:scale-[.98]">Open wallet <ArrowUpRight size={18} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-slate-400">Ads watched</p><p className="mt-1 text-xl font-bold">{watched}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-slate-400">Tasks completed</p><p className="mt-1 text-xl font-bold">0</p></div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-cyan-300">EARN TODAY</p><h3 className="mt-1 text-xl font-bold">Watch & Earn</h3></div>
            <div className="rounded-2xl bg-cyan-400/10 p-3"><Gift className="text-cyan-300" size={23} /></div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">Watch available rewarded ads to earn rewards. Your reward is confirmed securely after a valid ad event.</p>
          <button onClick={() => { setActive("Watch Ads"); setWatched(v => v + 1); }} className="mt-5 w-full rounded-2xl bg-white py-3.5 font-bold text-slate-950">Watch Ads</button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-slate-400">
          <span className="font-semibold text-white">More ways to earn</span><br />Complete eligible tasks and invite friends. Fraud prevention and reward validation run on the server.
        </div>
      </section>

      <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-white/10 bg-[#090e1b]/95 px-2 py-2 backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-1">
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => setActive(label)} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium ${active === label ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500"}`}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
