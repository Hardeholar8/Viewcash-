"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Users, CirclePlay, ClipboardList, WalletCards, ShieldAlert, Settings, LogOut } from "lucide-react";

type TelegramWebApp = { initData: string; ready: () => void; expand: () => void };
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }
type User = { id: string; telegram_id: number; username?: string; first_name?: string; last_name?: string; referral_code: string; status: string; created_at: string; wallets?: { balance: number; referral_balance: number; total_earned: number; total_withdrawn: number } | { balance: number; referral_balance: number; total_earned: number; total_withdrawn: number }[] | null };
const items = [["Dashboard", LayoutDashboard], ["Users", Users], ["Ads", CirclePlay], ["Tasks", ClipboardList], ["Withdrawals", WalletCards], ["Fraud / Risk", ShieldAlert], ["Settings", Settings]] as const;

export default function AdminPage() {
  const [active, setActive] = useState("Dashboard");
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState("Checking admin access...");
  const [stats, setStats] = useState({ users: 0, ads: 0, withdrawals: 0, flagged: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [adReward, setAdReward] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [cooldown, setCooldown] = useState(30);
  const [savingAds, setSavingAds] = useState(false);
  const [adsMessage, setAdsMessage] = useState("");

  useEffect(() => {
    const connect = async () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp?.initData) { setMessage("Open the Admin Panel from Telegram."); return; }
      webApp.ready(); webApp.expand();
      const session = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }), cache: "no-store" });
      if (!session.ok) { setMessage((await session.json().catch(() => ({}))).error || "Admin access denied."); return; }
      setAuthorized(true); setMessage("");
      const [statsResponse, settingsResponse] = await Promise.all([fetch("/api/admin/stats", { cache: "no-store" }), fetch("/api/admin/settings", { cache: "no-store" })]);
      if (statsResponse.ok) setStats(await statsResponse.json());
      if (settingsResponse.ok) { const data = await settingsResponse.json(); setAdReward(Number(data.ad_reward ?? 0)); setDailyLimit(Number(data.daily_ad_limit ?? 20)); setCooldown(Number(data.ad_cooldown_seconds ?? 30)); }
    };
    connect().catch(() => setMessage("Unable to verify admin access."));
  }, []);

  useEffect(() => {
    if (!authorized || active !== "Users") return;
    fetch(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => data && setUsers(data.users || [])).catch(() => {});
  }, [authorized, active, search]);

  const saveAds = async () => {
    setSavingAds(true); setAdsMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad_reward: adReward, daily_ad_limit: dailyLimit, ad_cooldown_seconds: cooldown }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save settings");
      setAdsMessage("Ad settings saved successfully.");
    } catch (error) { setAdsMessage(error instanceof Error ? error.message : "Unable to save settings"); }
    finally { setSavingAds(false); }
  };

  if (!authorized) return <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-6 text-center text-white"><div><h1 className="text-3xl font-extrabold">View<span className="text-cyan-400">Cash</span></h1><p className="mt-3 text-slate-400">{message}</p></div></main>;

  return <main className="min-h-screen bg-[#080d18] text-white md:flex">
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0b1120] p-5 md:block"><h1 className="text-2xl font-extrabold">View<span className="text-cyan-400">Cash</span></h1><p className="mt-1 text-xs text-slate-500">Admin Panel</p><nav className="mt-8 space-y-1">{items.map(([label, Icon]) => <button key={label} onClick={() => setActive(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${active === label ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400 hover:bg-white/5"}`}><Icon size={18}/>{label}</button>)}</nav><button onClick={() => window.location.reload()} className="mt-8 flex items-center gap-3 px-3 py-3 text-sm text-slate-500"><LogOut size={18}/>Sign out</button></aside>
    <section className="mx-auto w-full max-w-6xl p-5 md:p-8">
      <div className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#0b1120] p-2 md:hidden">{items.map(([label, Icon]) => <button key={label} onClick={() => setActive(label)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${active === label ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400"}`}><Icon size={15}/>{label}</button>)}</div>
      <header className="mb-7"><p className="text-sm text-slate-500">ViewCash control center</p><h2 className="mt-1 text-3xl font-extrabold">{active}</h2></header>
      {active === "Dashboard" && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Card title="Users" value={String(stats.users)} icon={<Users/>}/><Card title="Ads watched" value={String(stats.ads)} icon={<CirclePlay/>}/><Card title="Pending withdrawals" value={String(stats.withdrawals)} icon={<WalletCards/>}/><Card title="Risk flags" value={String(stats.flagged)} icon={<ShieldAlert/>}/></div><div className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5"><h3 className="font-bold">Admin controls</h3><p className="mt-2 text-sm leading-6 text-slate-400">Manage users, rewarded ads, tasks, withdrawals, fraud controls and platform settings from here.</p></div></>}
      {active === "Users" && <section><div className="mb-4"><input value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/40" placeholder="Search username or name" /></div><div className="space-y-3">{users.map(user => { const wallet = Array.isArray(user.wallets) ? user.wallets[0] : user.wallets; return <div key={user.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{user.username ? `@${user.username}` : user.first_name || "Telegram User"}</p><p className="mt-1 text-xs text-slate-500">{user.first_name || ""} {user.last_name || ""}</p></div><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-300">{user.status}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><Stat label="Balance" value={`₦${Number(wallet?.balance || 0).toFixed(2)}`} /><Stat label="Referral" value={`₦${Number(wallet?.referral_balance || 0).toFixed(2)}`} /></div></div>})}{users.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[.035] p-6 text-sm text-slate-500">No users found.</div>}</div></section>}
      {active === "Ads" && <section className="max-w-xl"><div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><h3 className="text-xl font-bold">Rewarded Ads Settings</h3><p className="mt-2 text-sm leading-6 text-slate-400">Control the reward and limits used by the rewarded-ad system. Rewards should only be credited after valid provider events.</p><div className="mt-5 space-y-4"><label className="block"><span className="text-sm text-slate-400">Reward per valid ad</span><input value={adReward} onChange={e => setAdReward(Number(e.target.value))} type="number" min="0" step="0.01" className="field mt-2" /></label><label className="block"><span className="text-sm text-slate-400">Daily ad limit</span><input value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} type="number" min="1" className="field mt-2" /></label><label className="block"><span className="text-sm text-slate-400">Cooldown between ads (seconds)</span><input value={cooldown} onChange={e => setCooldown(Number(e.target.value))} type="number" min="0" className="field mt-2" /></label><button disabled={savingAds} onClick={saveAds} className="w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950 disabled:opacity-50">{savingAds ? "Saving..." : "Save Ad Settings"}</button>{adsMessage && <p className="text-sm text-slate-400">{adsMessage}</p>}</div></div></section>}
      {active !== "Dashboard" && active !== "Users" && active !== "Ads" && <div className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><h3 className="text-xl font-bold">{active}</h3><p className="mt-2 text-sm text-slate-400">This section is ready for its secure database controls.</p></div>}
    </section>
  </main>;
}
function Card({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{title}</p><span className="text-cyan-300">{icon}</span></div><p className="mt-3 text-3xl font-extrabold">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
