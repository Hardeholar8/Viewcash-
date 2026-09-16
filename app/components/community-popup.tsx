"use client";

import { useEffect, useState } from "react";

type PopupData = {
  enabled: boolean;
  group_url: string;
  channel_url: string;
};

const SHOWN_KEY = "viewcash_community_popup_shown";

export default function CommunityPopup() {
  const [data, setData] = useState<PopupData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Show only once during the current login/app session. Navigation between
    // pages must not trigger the popup again. A fresh session starts after the
    // user logs in again.
    try {
      if (window.sessionStorage.getItem(SHOWN_KEY) === "1") return;
    } catch {
      // Continue if storage is unavailable.
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/community-popup?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || cancelled) return;
        const result = (await response.json()) as Partial<PopupData>;

        const next: PopupData = {
          enabled: result.enabled === true,
          group_url: typeof result.group_url === "string" ? result.group_url : "",
          channel_url: typeof result.channel_url === "string" ? result.channel_url : "",
        };

        if (next.enabled && (next.group_url || next.channel_url)) {
          try {
            window.sessionStorage.setItem(SHOWN_KEY, "1");
          } catch {
            // Ignore storage errors; the popup can still be shown.
          }
          setData(next);
          setOpen(true);
        }
      } catch {
        // The community popup must never block ViewCash if its settings request fails.
      }
    };

    const timer = window.setTimeout(load, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!open || !data) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] border border-cyan-300/20 bg-[#0b1120] p-5 text-white shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl">📢</div>
        <h2 className="mt-4 text-center text-xl font-black">Join Our Community</h2>
        <p className="mt-2 text-center text-sm leading-6 text-slate-400">
          Join our official group or channel to stay updated with ViewCash.
        </p>
        <div className="mt-5 space-y-2.5">
          {data.group_url && (
            <a href={data.group_url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-cyan-400 py-3 text-center text-sm font-extrabold text-slate-950">
              Join Group
            </a>
          )}
          {data.channel_url && (
            <a href={data.channel_url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/10 bg-white/[.05] py-3 text-center text-sm font-bold text-white">
              Join Channel
            </a>
          )}
        </div>
        <button onClick={() => setOpen(false)} className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-slate-400">
          Continue
        </button>
      </div>
    </div>
  );
}
