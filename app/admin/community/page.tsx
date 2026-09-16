"use client";

import { useEffect, useState } from "react";

export default function CommunityPopupAdmin() {
  const [enabled, setEnabled] = useState(false);
  const [groupUrl, setGroupUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/community-popup", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Unable to load settings.");
        setEnabled(Boolean(d.enabled));
        setGroupUrl(d.group_url || "");
        setChannelUrl(d.channel_url || "");
        setStatus("");
      })
      .catch((e) => setStatus(e.message || "Unable to load settings."));
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const r = await fetch("/api/admin/community-popup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, group_url: groupUrl, channel_url: channelUrl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to save settings.");
      setStatus("Community popup settings saved successfully.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080d18] px-4 py-8 text-white">
      <section className="mx-auto max-w-2xl">
        <a href="/admin" className="text-sm font-semibold text-cyan-300">← Back to Admin Panel</a>
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/[.035] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Admin Control</p>
          <h1 className="mt-1 text-2xl font-black">Community Popup</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Control the popup users see when they enter ViewCash. The popup message and design are fixed.</p>

          <label className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 p-4">
            <div><p className="font-bold">Show popup</p><p className="mt-1 text-xs text-slate-500">Turn the automatic popup on or off.</p></div>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
          </label>

          <label className="mt-4 block"><span className="text-sm text-slate-400">Group link</span><input value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} className="field mt-2" placeholder="https://t.me/yourgroup" inputMode="url" /></label>
          <label className="mt-4 block"><span className="text-sm text-slate-400">Channel link</span><input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} className="field mt-2" placeholder="https://t.me/yourchannel" inputMode="url" /></label>

          <button disabled={saving} onClick={save} className="mt-5 w-full rounded-2xl bg-cyan-400 py-3 font-extrabold text-slate-950 disabled:opacity-50">{saving ? "Saving..." : "Save Community Popup"}</button>
          {status && <p className="mt-3 text-sm text-cyan-200">{status}</p>}
        </div>
      </section>
    </main>
  );
}
