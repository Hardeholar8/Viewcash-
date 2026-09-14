"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Users, CirclePlay, ClipboardList, WalletCards, ShieldAlert, Settings, LogOut } from "lucide-react";

type TelegramWebApp = { initData: string; ready: () => void; expand: () => void };
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

const items = [["Dashboard", LayoutDashboard], ["Users", Users], ["Ads", CirclePlay], ["Tasks", ClipboardList], ["Withdrawals", WalletCards], ["Fraud / Risk", ShieldAlert], ["Settings", Settings]] as const;

export default function AdminPage() {
  const [active, setActive] = useState("Dashboard");
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState("Checking admin access...");
  const [stats, setStats] = useState({ users: 0, ads: 0, withdrawals: 0, flagged: 0 });

  useEffect(() => {
    const connect = async () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp?.initData) { setMessage("Open the Admin Panel from Telegram."); return; }
      webApp.ready(); webApp.expand();
      const session = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }), cache: "no-store" });
      if (!session.ok) { setMessage((await session.json().catch(() => ({}))).error || "Admin access denied."); return; }
      setAuthorized(true); setMessage("");
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      if (response.ok) setStats(await response.json());
    };
    connect().catch(() => setMessage("Unable to verify admin access."));
  }, []);

  if (!authorized) return <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-6 text-center text-white"><div><h1 className="text-3xl font-extrabold">View<span className="text-cyan-400">Cash</span></h1><p className="mt-3 text-slate-400">{message}</p></div></main>;

  return <main className="min-h-screen bg-[#080d18] text-white md:flex">
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0b1120] p-5 md:block"><h1 className="text-2xl font-extrabold">View<span className="text-cyan-400">Cash</span></h1><p className="mt-1 text-xs text-slate-500">Admin Panel</p><nav className="mt-8 space-y-1">{items.map(([label, Icon]) => <button key={label} onClick={() => setActive(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${active === label ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400 hover:bg-white/5"}`}><Icon size={18}/>{label}</button>)}</nav><button onClick={() => window.location.reload()} className="mt-8 flex items-center gap-3 px-3 py-3 text-sm text-slate-500"><LogOut size={18}/>Sign out</button></aside>
    <section className="mx-auto w-full max-w-6xl p-5 md:p-8"><header className="mb-7"><p className="text-sm text-slate-500">ViewCash control center</p><h2 className="mt-1 text-3xl font-extrabold">{active}</h2></header>{active === "Dashboard" ? <><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Card title="Users" value={String(stats.users)} icon={<Users/>}/><Card title="Ads watched" value={String(stats.ads)} icon={<CirclePlay/>}/><Card title="Pending withdrawals" value={String(stats.withdrawals)} icon={<WalletCards/>}/><Card title="Risk flags" value={String(stats.flagged)} icon={<ShieldAlert/>}/></div><div className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5"><h3 className="font-bold">Admin controls</h3><p className="mt-2 text-sm leading-6 text-slate-400">Manage users, rewarded ads, tasks, withdrawals, fraud controls and platform settings from here.</p></div></> : <div className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><h3 className="text-xl font-bold">{active}</h3><p className="mt-2 text-sm text-slate-400">This section is ready for its secure database controls.</p></div>}</section>
  </main>;
}
function Card({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{title}</p><span className="text-cyan-300">{icon}</span></div><p className="mt-3 text-3xl font-extrabold">{value}</p></div>; }
