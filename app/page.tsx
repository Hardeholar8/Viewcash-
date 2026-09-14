"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  ChevronRight,
  CirclePlay,
  ClipboardList,
  Copy,
  Gift,
  Home,
  Landmark,
  LockKeyhole,
  Share2,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import MonetagWatch from "./components/monetag-watch";

type TelegramWebApp = { initData: string; ready: () => void; expand: () => void };
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type Section = "Home" | "Watch Ads" | "Tasks" | "Wallet" | "Referral" | "Withdraw" | "Profile";
type WalletType = "tasks" | "affiliate";
type Task = {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  task_type: string;
  action_url: string | null;
  verification_type: string;
  telegram_chat: string | null;
  completion_status?: string | null;
};

const nav: { label: Section; icon: LucideIcon }[] = [
  { label: "Watch Ads", icon: CirclePlay },
  { label: "Tasks", icon: ClipboardList },
  { label: "Home", icon: Home },
  { label: "Referral", icon: Users },
  { label: "Profile", icon: UserRound },
];

export default function HomePage() {
  const [active, setActive] = useState<Section>("Home");
  const [coins, setCoins] = useState(0);
  const [referralCoins, setReferralCoins] = useState(0);
  const [activated, setActivated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [displayName, setDisplayName] = useState("");
  const [initData, setInitData] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [showActivation, setShowActivation] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [withdrawCoins, setWithdrawCoins] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState<WalletType>("tasks");

  const refresh = async () => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return;
    const r = await fetch("/api/telegram/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
      cache: "no-store",
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Connection failed");
    setInitData(tg.initData);
    setCoins(Number(d.coins || 0));
    setReferralCoins(Number(d.referral_coins || 0));
    setActivated(Boolean(d.activated));
    setDisplayName(d.display_name || "Telegram User");
    setReferralCode(d.referral_code || "");
    setReferralLink(d.referral_link || "");
    setStatus(d.activated ? "Account active" : "Activation required");

    const a = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
      cache: "no-store",
    });
    setIsAdmin(a.ok);
  };

  useEffect(() => {
    let dead = false;
    let tries = 0;
    const run = async () => {
      if (dead) return;
      const tg = window.Telegram?.WebApp;
      if (!tg) {
        tries++;
        if (tries < 30) return void setTimeout(run, 250);
        setStatus("Open ViewCash from Telegram");
        return;
      }
      try {
        tg.ready();
        tg.expand();
        await refresh();
      } catch (e) {
        if (!dead) setStatus(e instanceof Error ? e.message : "Unable to connect");
      }
    };
    run();
    return () => { dead = true; };
  }, []);

  const activate = async () => {
    setMessage("");
    if (!email) return setShowActivation(true);
    setBusy("activate");
    try {
      const r = await fetch("/api/account/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, email }),
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to start activation payment.");
      if (!d.payment_url) throw new Error("Payment link was not created.");
      window.location.assign(d.payment_url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to start activation payment.");
      setBusy(null);
    }
  };

  const checkIn = async () => {
    if (!initData) return setMessage("Open ViewCash from Telegram first.");
    setBusy("checkin");
    setMessage("");
    try {
      const r = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Check-in failed.");
      if (d.checked_in) {
        setCoins((v) => v + Number(d.reward_coins || 0));
        setMessage(`Daily check-in claimed: +${Number(d.reward_coins || 0).toLocaleString()} coins. Streak: day ${Number(d.streak_day || 1)}.`);
      } else setMessage(`Already checked in today. Streak: day ${Number(d.streak_day || 1)}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Check-in failed.");
    } finally { setBusy(null); }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/tasks?initData=${encodeURIComponent(initData)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to load tasks");
      setTasks(d.tasks || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load tasks");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (active === "Tasks" && initData && activated) loadTasks();
  }, [active, initData, activated]);

  const verify = async (task: Task) => {
    setBusy(task.id); setMessage("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, initData }), cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Task verification failed");
      setCoins((v) => v + Number(d.reward || 0));
      setMessage(`Task completed: +${Number(d.reward || 0).toLocaleString()} coins`);
      await loadTasks();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Task verification failed"); }
    finally { setBusy(null); }
  };

  const openWithdraw = (wallet: WalletType) => { setWithdrawWallet(wallet); setWithdrawCoins(""); setMessage(""); setActive("Withdraw"); };

  const withdraw = async () => {
    const amount = Number(withdrawCoins);
    const available = withdrawWallet === "affiliate" ? referralCoins : coins;
    if (!activated) return setMessage("Activate your account first.");
    if (!Number.isInteger(amount) || amount <= 0) return setMessage("Enter a valid coin amount.");
    if (amount > available) return setMessage(`Insufficient ${withdrawWallet === "affiliate" ? "affiliate" : "task"} coins.`);
    if (!bankName || !accountName || !/^\d{10}$/.test(accountNumber)) return setMessage("Enter valid bank details.");
    setBusy("withdraw");
    try {
      const r = await fetch("/api/withdrawals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, bank_name: bankName, account_name: accountName, account_number: accountNumber, coins: amount, wallet_type: withdrawWallet }), cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Withdrawal failed");
      if (withdrawWallet === "affiliate") setReferralCoins((v) => v - amount); else setCoins((v) => v - amount);
      setWithdrawCoins("");
      setMessage(`${withdrawWallet === "affiliate" ? "Affiliate" : "Task"} wallet withdrawal submitted. Cash value: ₦${Number(d.cash_amount || 0).toFixed(2)}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Withdrawal failed"); }
    finally { setBusy(null); }
  };

  const copyReferral = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); setMessage("Referral link copied."); }
    catch { setMessage("Copy failed. Long-press the link to copy it."); }
  };
  const shareReferral = () => {
    if (!referralLink) return;
    const text = "Join ViewCash and earn rewards from ads, tasks and referrals.";
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const locked = ["Watch Ads", "Tasks", "Withdraw"].includes(active) && !activated;
  const activationBox = !activated ? <div className="mb-4 overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[.10] via-white/[.035] to-transparent p-4 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-300"><Landmark size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Get started</p><h2 className="mt-1 text-base font-bold">Activate your account</h2><p className="mt-1 text-xs leading-5 text-slate-400">Unlock ads, tasks and withdrawals after secure activation.</p></div></div>{showActivation&&<input value={email} onChange={e=>setEmail(e.target.value)} className="field mt-3" placeholder="Email for payment receipt" type="email" autoComplete="email"/>}<button onClick={()=>showActivation?activate():setShowActivation(true)} disabled={busy==="activate"} className="mt-3 w-full rounded-2xl bg-cyan-400 py-3 text-sm font-extrabold text-slate-950 disabled:opacity-50">{busy==="activate"?"Opening payment...":showActivation?"Continue to Payment":"Activate Account"}</button></div> : null;

  const page = () => {
    if (locked) return <Page title={active} icon={<LockKeyhole size={20}/>}><EmptyState icon={<LockKeyhole size={28}/>} title="Locked until activation" text="Complete account activation to unlock this section." /></Page>;
    if (active === "Watch Ads") return <Page title="Watch Ads" icon={<CirclePlay size={20}/>}><div className="mb-4 rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[.10] to-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Rewarded ads</p><h3 className="mt-1 text-lg font-bold">Turn attention into coins</h3><p className="mt-1 text-sm leading-5 text-slate-400">Watch a valid rewarded ad. Coins are added only after server confirmation.</p></div><MonetagWatch initData={initData}/></Page>;
    if (active === "Tasks") return <Page title="Tasks" icon={<ClipboardList size={20}/>} >{loading?<EmptyState title="Loading tasks" text="Finding available tasks for your account..."/>:<div className="space-y-3">{tasks.map(task=><article key={task.id} className="rounded-3xl border border-white/10 bg-white/[.035] p-4 shadow-lg shadow-black/10"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Task</p><h3 className="mt-1 text-base font-bold">{task.title}</h3><p className="mt-1.5 text-sm leading-5 text-slate-400">{task.description||"Complete this task to earn coins."}</p></div><span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-bold text-cyan-300">+{Number(task.reward).toLocaleString()}</span></div>{task.verification_type==="telegram"&&<div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>task.action_url&&window.open(task.action_url,"_blank","noopener,noreferrer")} className="rounded-2xl border border-white/10 bg-white/[.03] py-2.5 text-sm font-semibold">Join</button><button disabled={busy===task.id||task.completion_status==="approved"} onClick={()=>verify(task)} className="rounded-2xl bg-cyan-400 py-2.5 text-sm font-extrabold text-slate-950 disabled:opacity-50">{task.completion_status==="approved"?"Completed":busy===task.id?"Verifying...":"Verify"}</button></div>}</article>)}{!tasks.length&&<EmptyState title="No tasks yet" text="New tasks will appear here when available."/>}</div>}</Page>;
    if (active === "Wallet") return <Page title="Wallet" icon={<Wallet size={20}/>}><div className="space-y-3"><WalletBox title="Task Wallet" subtitle="Ads and task rewards" coins={coins} onWithdraw={()=>openWithdraw("tasks")}/><WalletBox title="Affiliate Wallet" subtitle="Referral rewards" coins={referralCoins} onWithdraw={()=>openWithdraw("affiliate")}/></div><div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-3 text-xs leading-5 text-slate-500">Your Task and Affiliate wallets are separate balances.</div></Page>;
    if (active === "Referral") return <Page title="Referral" icon={<Users size={20}/>}><WalletBox title="Affiliate Wallet" subtitle="Referral rewards" coins={referralCoins} onWithdraw={()=>openWithdraw("affiliate")}/><div className="mt-4 rounded-3xl border border-cyan-300/15 bg-cyan-400/[.05] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Invite & earn</p><h3 className="mt-1 text-base font-bold">Your referral link</h3><p className="mt-2 break-all rounded-2xl bg-black/20 p-3 text-xs leading-5 text-slate-300">{referralLink||"Loading referral link..."}</p><p className="mt-2 text-[11px] text-slate-500">Code: {referralCode||"..."}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={copyReferral} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.03] py-2.5 text-sm font-semibold"><Copy size={16}/>Copy</button><button onClick={shareReferral} className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 py-2.5 text-sm font-extrabold text-slate-950"><Share2 size={16}/>Share</button></div></div></Page>;
    if (active === "Withdraw") return <Page title="Withdraw" icon={<Landmark size={20}/>}><div className="rounded-3xl border border-white/10 bg-white/[.035] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Choose wallet</p><select value={withdrawWallet} onChange={e=>setWithdrawWallet(e.target.value as WalletType)} className="field mt-2 w-full appearance-none"><option value="tasks">Task Wallet</option><option value="affiliate">Affiliate Wallet</option></select></div><div className="mt-3"><WalletBox title={withdrawWallet==="affiliate"?"Affiliate Wallet":"Task Wallet"} subtitle={withdrawWallet==="affiliate"?"Referral coins":"Task and ad coins"} coins={withdrawWallet==="affiliate"?referralCoins:coins}/></div><div className="mt-4 space-y-3"><input value={bankName} onChange={e=>setBankName(e.target.value)} className="field" placeholder="Bank name"/><input value={accountName} onChange={e=>setAccountName(e.target.value)} className="field" placeholder="Account name"/><input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} className="field" placeholder="Account number" inputMode="numeric"/><input value={withdrawCoins} onChange={e=>setWithdrawCoins(e.target.value.replace(/\D/g,""))} className="field" placeholder={`${withdrawWallet==="affiliate"?"Affiliate":"Task"} coins to withdraw`} inputMode="numeric"/><button disabled={busy==="withdraw"} onClick={withdraw} className="w-full rounded-2xl bg-cyan-400 py-3 text-sm font-extrabold text-slate-950 disabled:opacity-50">{busy==="withdraw"?"Submitting...":"Submit withdrawal"}</button></div></Page>;
    if (active === "Profile") return <Page title="Profile" icon={<UserRound size={20}/>}><div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/[.10] to-white/[.025] p-5"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-black text-slate-950">VC</div><div><p className="text-lg font-bold">{displayName||"Telegram User"}</p><p className="mt-1 text-xs text-slate-500">{activated?"Account active":"Activation required"}</p></div></div></div></Page>;
    return <section className="px-4">{activationBox}{message&&<Notice text={message}/>}<div className="overflow-hidden rounded-[1.6rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[.18] via-blue-500/[.08] to-transparent p-5 shadow-2xl shadow-cyan-950/20"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/80">Total balance</p><p className="mt-2 text-4xl font-black tracking-tight">{coins.toLocaleString()} <span className="text-sm font-bold text-cyan-200">coins</span></p><p className="mt-2 text-xs text-slate-400">Task wallet balance</p></div><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[.08] text-cyan-200"><Wallet size={20}/></div></div><button onClick={()=>setActive("Wallet")} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-white/[.07] px-4 py-3 text-sm font-semibold"><span>Manage wallets</span><ChevronRight size={17}/></button></div><div className="mt-3 grid grid-cols-2 gap-3"><MiniStat label="Affiliate" value={referralCoins.toLocaleString()} icon={<Users size={16}/>} /><MiniStat label="Status" value={activated?"Active":"Locked"} icon={activated?<ShieldCheck size={16}/>:<LockKeyhole size={16}/>} /></div><div className="mt-5 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Quick actions</p><h3 className="mt-1 text-lg font-bold">Earn & manage</h3></div><span className="text-[10px] font-semibold text-slate-600">Fast access</span></div><div className="mt-3 grid grid-cols-2 gap-2.5"><QuickAction icon={<CalendarCheck size={18}/>} label="Daily Check-in" sub={busy==="checkin"?"Claiming...":"Daily bonus"} onClick={checkIn} disabled={busy==="checkin"}/><QuickAction icon={<CirclePlay size={18}/>} label="Watch Ads" sub="Earn coins" onClick={()=>setActive("Watch Ads")} disabled={!activated}/><QuickAction icon={<ClipboardList size={18}/>} label="Tasks" sub="Complete tasks" onClick={()=>setActive("Tasks")} disabled={!activated}/><QuickAction icon={<Users size={18}/>} label="Referral" sub="Invite friends" onClick={()=>setActive("Referral")}/><QuickAction icon={<Wallet size={18}/>} label="Wallet" sub="Manage balance" onClick={()=>setActive("Wallet")}/><QuickAction icon={<Gift size={18}/>} label="Bonus" sub="Coming soon" onClick={()=>setMessage("Bonus features are coming soon.")}/></div>{isAdmin&&<button onClick={()=>window.location.assign("/admin")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 py-3 text-sm font-bold text-cyan-300"><ShieldCheck size={18}/>Admin Panel</button>}<div className="mt-5 rounded-3xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Your progress</p><p className="mt-1 text-sm font-semibold">Keep your streak going</p></div><Gift size={19} className="text-cyan-300" /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[42%] rounded-full bg-cyan-400" /></div><p className="mt-2 text-[11px] text-slate-500">Complete daily actions to build your earning history.</p></div></section>;
  };

  return <main className="mx-auto min-h-screen max-w-md bg-[#070b14] pb-28 shadow-2xl"><header className="px-4 pb-4 pt-6"><div className="flex items-center justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Welcome back</p><h1 className="mt-1 text-2xl font-black tracking-tight">View<span className="text-cyan-400">Cash</span></h1><div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-2.5 py-1 text-[10px] font-semibold text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${status === "Account active" ? "bg-emerald-400" : "bg-amber-300"}`} />{status}</div></div><button onClick={()=>setActive("Profile")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[.05] text-sm font-black text-cyan-300">VC</button></div></header>{page()}<nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-white/10 bg-[#080c16]/95 px-2 py-2 backdrop-blur-2xl"><div className="grid grid-cols-5 items-end gap-1">{nav.map(({label,icon:Icon})=>{const home=label==="Home";const selected=active===label;return <button key={label} onClick={()=>setActive(label)} className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-semibold transition ${home?"-mt-6":""} ${selected?"text-cyan-300":"text-slate-500"}`}><span className={home?`flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-[#070b14] shadow-xl ${selected?"bg-cyan-400 text-slate-950 shadow-cyan-950/40":"bg-white/10 text-slate-300"}`:`flex h-8 w-8 items-center justify-center rounded-xl ${selected?"bg-cyan-400/10 text-cyan-300":"bg-white/[.025]"}`}><Icon size={home?22:17}/></span><span>{label}</span></button>})}</div></nav></main>;
}

function Page({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}){return <section className="px-4"><div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300">{icon}</div><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">ViewCash</p><h2 className="mt-0.5 text-xl font-black">{title}</h2></div></div>{children}</section>}
function WalletBox({title,subtitle,coins,onWithdraw}:{title:string;subtitle:string;coins:number;onWithdraw?:()=>void}){return <div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[.10] via-blue-500/[.05] to-white/[.015] p-4 shadow-lg shadow-black/10"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{subtitle}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Wallet size={17}/></span></div><p className="mt-4 text-2xl font-black tracking-tight">{coins.toLocaleString()} <span className="text-xs font-bold text-cyan-300">coins</span></p>{onWithdraw&&<button onClick={onWithdraw} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.035] px-3.5 py-2.5 text-xs font-bold text-cyan-300"><span>Withdraw from this wallet</span><ChevronRight size={15}/></button>}</div>}
function MiniStat({label,value,icon}:{label:string;value:string;icon:ReactNode}){return <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3.5"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><span className="text-cyan-300">{icon}</span></div><p className="mt-2 text-lg font-black">{value}</p></div>}
function QuickAction({icon,label,sub,onClick,disabled=false}:{icon:ReactNode;label:string;sub:string;onClick:()=>void;disabled?:boolean}){return <button disabled={disabled} onClick={onClick} className="group flex min-h-[78px] items-center gap-3 rounded-3xl border border-white/10 bg-white/[.03] p-3 text-left shadow-lg shadow-black/5 transition active:scale-[.98] disabled:opacity-35"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/10 bg-cyan-400/10 text-cyan-300">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{sub}</span></span><ChevronRight size={14} className="text-slate-600"/></button>}
function Notice({text}:{text:string}){return <div className="mb-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-3 text-xs leading-5 text-cyan-200">{text}</div>}
function EmptyState({icon,title,text}:{icon?:ReactNode;title:string;text:string}){return <div className="rounded-3xl border border-white/10 bg-white/[.025] p-7 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[.04] text-slate-500">{icon||<ClipboardList size={24}/>}</div><h3 className="mt-3 text-base font-bold">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p></div>}
