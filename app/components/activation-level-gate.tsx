"use client";

import { useEffect, useState } from "react";

type Level = { level: number; name: string; activation_fee: number; daily_earning_cap?: number };
declare global { interface Window { Telegram?: { WebApp?: { initData?: string } } } }

export default function ActivationLevelGate() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const open = async () => {
      setVisible(true);
      setMessage("");
      setLoading(true);
      try {
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || "";
        if (!initData) throw new Error("Please open ViewCash from Telegram.");
        const sessionResponse = await fetch("/api/telegram/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }), cache: "no-store" });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok) throw new Error(session.error || "Unable to check your account.");
        if (session.activated) { setVisible(false); return; }
        const r = await fetch("/api/account/activation-levels", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !Array.isArray(d.levels)) throw new Error(d.error || "Unable to load activation options.");
        setLevels(d.levels);
        setSelected(d.levels[0]?.level ?? null);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Unable to load activation options.");
      } finally {
        setLoading(false);
      }
    };
    const handler = () => { void open(); };
    window.addEventListener("viewcash:open-activation", handler);
    return () => window.removeEventListener("viewcash:open-activation", handler);
  }, []);

  const close = () => {
    if (paying) return;
    setVisible(false);
    setMessage("");
  };

  const activate = async () => {
    const initData = window.Telegram?.WebApp?.initData || "";
    if (!selected) return setMessage("Select an activation option.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessage("Enter a valid email address.");
    if (!initData) return setMessage("Please open ViewCash from Telegram.");
    setPaying(true); setMessage("");
    try {
      const r = await fetch("/api/account/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, email: email.trim(), account_level: selected }), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to start activation payment.");
      if (!d.payment_url) throw new Error("Payment link was not created.");
      window.location.assign(d.payment_url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to start activation payment.");
      setPaying(false);
    }
  };

  if (!visible) return null;

  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
    <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b1020] p-5 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Get started</p>
          <h2 className="mt-1 text-2xl font-black">Choose your activation</h2>
          <p className="mt-2 text-sm leading-5 text-slate-400">Select one option. Your choice is saved when activation is completed.</p>
        </div>
        <button onClick={close} aria-label="Close" className="rounded-xl px-2 py-1 text-xl text-slate-400 hover:text-white">×</button>
      </div>
      {loading ? <p className="py-8 text-center text-sm text-slate-400">Loading activation options...</p> : <>
        <div className="mt-5 space-y-3">{levels.map(level => <button key={level.level} onClick={() => setSelected(level.level)} className={`w-full rounded-3xl border p-4 text-left ${selected===level.level ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/[.035]"}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="font-bold">{level.name}</p><p className="mt-1 text-xs text-slate-400">{level.daily_earning_cap ? `Earn up to ${Number(level.daily_earning_cap).toLocaleString()} per day` : "Activation plan"}</p></div><p className="font-black text-cyan-300">₦{Number(level.activation_fee).toLocaleString()}</p></div>
        </button>)}</div>
        <input value={email} onChange={e=>setEmail(e.target.value)} className="field mt-4" placeholder="Email for payment receipt" type="email" autoComplete="email" />
        {message && <p className="mt-3 rounded-2xl bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{message}</p>}
        <button onClick={activate} disabled={paying} className="mt-4 w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-extrabold text-slate-950 disabled:opacity-50">{paying ? "Opening payment..." : "Continue to Payment"}</button>
      </>}
    </div>
  </div>;
}
