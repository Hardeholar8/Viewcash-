"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Plan = { name: string; daily_earning_cap: number; activation_fee: number } | null;

declare global { interface Window { Telegram?: { WebApp?: { initData?: string } } } }

export default function CurrentPlanCard() {
  const [plan, setPlan] = useState<Plan>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const initData = window.Telegram?.WebApp?.initData || "";
      if (!initData) return;
      try {
        const r = await fetch("/api/telegram/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }), cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setPlan(d.plan || null);
      } catch {}
    };
    const timer = window.setTimeout(load, 900);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const update = () => {
      const heading = document.querySelector("h2")?.textContent?.trim();
      const section = heading === "Profile" ? document.querySelector("section.px-4") : null;
      if (!section) { setSlot(null); return; }
      let target = document.getElementById("viewcash-profile-plan-slot");
      if (!target) {
        target = document.createElement("div");
        target.id = "viewcash-profile-plan-slot";
        const profileCard = section.querySelector(":scope > div:nth-child(2)");
        if (profileCard?.parentElement) profileCard.parentElement.insertBefore(target, profileCard.nextSibling);
        else section.appendChild(target);
      }
      setSlot(target);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    update();
    return () => { observer.disconnect(); setSlot(null); document.getElementById("viewcash-profile-plan-slot")?.remove(); };
  }, []);

  if (!plan || !slot) return null;
  return createPortal(
    <div className="mt-3 rounded-3xl border border-cyan-300/15 bg-cyan-400/[.06] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Your Plan</p>
      <p className="mt-1 text-base font-black">{plan.name}</p>
      <p className="mt-1 text-sm text-slate-400">Earn up to {Number(plan.daily_earning_cap).toLocaleString()} per day</p>
    </div>,
    slot
  );
}
