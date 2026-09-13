"use client";

import { useEffect, useState } from "react";
import { CirclePlay, ClipboardList, Gift, Home, Wallet, ArrowUpRight, Users, UserRound, Landmark } from "lucide-react";

type TelegramWebApp = { initData: string; ready: () => void; expand: () => void };
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

type Section = "Home" | "Watch Ads" | "Tasks" | "Wallet" | "Referral" | "Withdraw" | "Profile";

const nav: { label: Section; icon: any }[] = [
  { label: "Home", icon: Home },
  { label: "Watch Ads", icon: CirclePlay },
  { label: "Tasks", icon: ClipboardList },
  { label: "Wallet", icon: Wallet },
  { label: "Referral", icon: Users },
];

export default function HomePage() {
  const [active, setActive] = useState<Section>("Home");
  const [balance, setBalance] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [status, setStatus] = useState("Connecting...");
  const [username, setUsername] = useState("");

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) { setStatus("Open ViewCash from Telegram"); return; }
    webApp.ready(); webApp.expand();
    fetch("/api/telegram/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }) })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setBalance(Number(d.balance || 0)); setReferralBalance(Number(d.referral_balance || 0)); setUsername(d.username || ""); setStatus(d.username ? `@${d.username}` : "Connected"); })
      .catch(() => setStatus("Telegram connection pending"));
  }, []);

  const go = (section: Section) => setActive(section);

  const content = () => {
    if (active === "Watch Ads") return <Page title="Watch Ads" icon={<CirclePlay />}><p className="text-slate-400">Watch available rewarded ads and earn when a valid ad event is confirmed.</p><div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5"><p className="text-sm text-slate-400">Rewarded ads</p><p className="mt-1 text-lg font-bold">Coming next</p><p className="mt-2 text-sm text-slate-500">The secure ad provider connection will be enabled here. No balance is credited by simply pressing a button.</p></div></Page>;
    if (active === "Tasks") return <Page title="Tasks" icon={<ClipboardList />}><p className="text-slate-400">Complete eligible tasks and receive rewards after verification.</p><div className="mt-5 rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="font-semibold">No tasks available yet</p><p className="mt-2 text-sm text-slate-500">New tasks will appear here when they are published.</p></div></Page>;
    if (active === "Wallet") return <Page title="Wallet" icon={<Wallet />}><BalanceCard balance={balance} /><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Referral" value={`₦${referralBalance.toFixed(2)}`} /><Stat label="Available" value={`₦${balance.toFixed(2)}`} /></div><button onClick={() => go("Withdraw")} className="mt-5 w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950">Withdraw</button></Page>;
    if (active === "Referral") return <Page title="Referral" icon={<Users />}><div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-slate-400">Referral balance</p><p className="mt-1 text-3xl font-extrabold">₦{referralBalance.toFixed(2)}</p><p className="mt-4 text-sm text-slate-500">Your referral tools will appear here after the referral system is connected.</p></div></Page>;
    if (active === "Withdraw") return <Page title="Withdraw" icon={<Landmark />}><p className="text-sm text-slate-400">Enter your bank details and submit an eligible withdrawal.</p><div className="mt-5 space-y-3"><input className="field" placeholder="Bank name" /><input className="field" placeholder="Account name" /><input className="field" placeholder="Account number" inputMode="numeric" /><input className="field" placeholder="Amount" inputMode="decimal" /><button className="w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950">Submit withdrawal</button></div></Page>;
    if (active === "Profile") return <Page title="Profile" icon={<UserRound />}><div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-slate-400">Telegram account</p><p className="mt-1 font-bold">{username || status}</p></div></Page>;
    return <><section className="px-5"><BalanceCard balance={balance} /><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Ads watched" value="0" /><Stat label="Tasks completed" value="0" /></div><div className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-cyan-300">EARN TODAY</p><h3 className="mt-1 text-xl font-bold">Watch & Earn</h3></div><div className="rounded-2xl bg-cyan-400/10 p-3"><Gift className="text-cyan-300" size={23} /></div></div><p className="mt-3 text-sm leading-6 text-slate-400">Watch available rewarded ads to earn rewards. Rewards are confirmed securely after valid ad events.</p><button onClick={() => go("Watch Ads")} className="mt-5 w-full rounded-2xl bg-white py-3.5 font-bold text-slate-950">Watch Ads</button></div><div className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-slate-400"><span className="font-semibold text-white">More ways to earn</span><br />Complete eligible tasks and invite friends.</div></section></>;
  };

  return <main className="mx-auto min-h-screen max-w-md bg-[#0b1020] pb-24 shadow-2xl"><header className="px-5 pt-8 pb-5"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-400">Welcome to</p><h1 className="text-2xl font-bold tracking-tight">View<span className="text-cyan-400">Cash</span></h1><p className="mt-1 text-xs text-slate-500">{status}</p></div><button onClick={() => go("Profile")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-bold">VC</button></div></header>{content()}<nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-white/10 bg-[#090e1b]/95 px-2 py-2 backdrop-blur-xl"><div className="grid grid-cols-5 gap-1">{nav.map(({label,icon:Icon}) => <button key={label} onClick={() => go(label)} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium ${active===label ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500"}`}><Icon size={19}/><span>{label}</span></button>)}</div></nav></main>;
}

function Page({title, icon, children}:{title:string;icon:React.ReactNode;children:React.ReactNode}) { return <section className="px-5"><div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">{icon}</div><h2 className="text-2xl font-bold">{title}</h2></div>{children}</section>; }
function BalanceCard({balance}:{balance:number}) { return <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent p-6 shadow-lg shadow-cyan-950/30"><p className="text-sm text-slate-300">Available balance</p><div className="mt-2 flex items-end justify-between"><h2 className="text-4xl font-extrabold">₦{balance.toFixed(2)}</h2><Wallet className="mb-1 text-cyan-300" size={28}/></div></div>; }
function Stat({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>; }
