"use client";

import { useEffect, useState } from "react";

type Flag = { id: string; user_id: string; reason: string; severity: string; metadata: Record<string, unknown>; resolved: boolean; created_at: string; telegram_id?: number; username?: string; first_name?: string; last_name?: string };
type Summary = { open: number; critical: number; high: number; medium: number; low: number };

export default function FraudPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [summary, setSummary] = useState<Summary>({ open: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const [message, setMessage] = useState("Loading risk controls...");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setMessage("Loading risk controls...");
    const r = await fetch(`/api/admin/fraud?status=${status}&severity=${severity}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(d.error || "Unable to load fraud data."); return; }
    setFlags(d.flags || []); setSummary(d.summary || { open: 0, critical: 0, high: 0, medium: 0, low: 0 }); setMessage("");
  };

  useEffect(() => { load().catch(() => setMessage("Unable to load fraud data.")); }, [status, severity]);

  const resolve = async (id: string) => {
    setBusy(id);
    const r = await fetch("/api/admin/fraud", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMessage(d.error || "Unable to resolve flag."); return; }
    load();
  };

  return <main className="min-h-screen bg-[#080d18] p-5 text-white md:p-8"><div className="mx-auto max-w-5xl">
    <div className="mb-6 flex items-start gap-3">
      <button type="button" onClick={() => { if (window.top) window.top.location.href = "/admin"; }} className="mt-1 shrink-0 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">← Back</button>
      <div><p className="text-sm text-slate-500">ViewCash control center</p><h1 className="mt-1 text-3xl font-extrabold">Fraud / Risk</h1><p className="mt-2 text-sm text-slate-400">Review suspicious activity detected by secure server-side controls.</p></div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Open" value={summary.open}/><Metric label="Critical" value={summary.critical}/><Metric label="High" value={summary.high}/><Metric label="Medium" value={summary.medium}/><Metric label="Low" value={summary.low}/></div>
    <div className="mt-6 flex gap-3"><select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1120] px-3 py-3 text-sm"><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select><select value={severity} onChange={e => setSeverity(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1120] px-3 py-3 text-sm"><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
    {message && <p className="mt-5 text-sm text-slate-500">{message}</p>}
    <div className="mt-5 space-y-3">{flags.map(f => <article key={f.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{f.reason}</p><p className="mt-1 text-xs text-slate-500">{f.username ? `@${f.username}` : f.first_name || "Telegram user"}{f.telegram_id ? ` · ${f.telegram_id}` : ""}</p></div><span className="rounded-full bg-red-400/10 px-2.5 py-1 text-[11px] uppercase text-red-300">{f.severity}</span></div><p className="mt-3 text-xs text-slate-500">{new Date(f.created_at).toLocaleString()}</p>{Object.keys(f.metadata || {}).length > 0 && <pre className="mt-3 overflow-auto rounded-xl bg-black/20 p-3 text-xs text-slate-400">{JSON.stringify(f.metadata, null, 2)}</pre>}{!f.resolved && <button disabled={busy === f.id} onClick={() => resolve(f.id)} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{busy === f.id ? "Resolving..." : "Mark resolved"}</button>}</article>)}{!message && flags.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[.035] p-6 text-sm text-slate-500">No fraud flags found.</div>}</div>
  </div></main>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div>; }
