"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

type PageName = "Home" | "Watch Ads" | "Tasks" | "Wallet" | "Referral" | "Profile" | "Withdraw" | "History";
const pageNames: PageName[] = ["Home", "Watch Ads", "Tasks", "Wallet", "Referral", "Profile", "Withdraw", "History"];

function pageFromButton(button: HTMLButtonElement): PageName | null {
  const text = (button.textContent || "").replace(/\s+/g, " ").trim();
  if (text.includes("Transaction History")) return "History";
  if (text === "VC") return "Profile";
  for (const page of pageNames) {
    if (text === page || text.startsWith(`${page} `) || text.includes(page)) return page;
  }
  return null;
}

function pageFromHeading(): PageName | null {
  const heading = document.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() || "";
  return pageNames.includes(heading as PageName) ? heading as PageName : "Home";
}

function findPageButton(page: PageName): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((button) => !button.dataset.viewcashBack && pageFromButton(button) === page) || null;
}

export default function ViewCashBackNavigation() {
  const stack = useRef<PageName[]>(["Home"]);
  const suppress = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const recordPage = (page: PageName | null) => {
      if (!page) return;
      const last = stack.current[stack.current.length - 1];
      if (last === page) return;
      stack.current = [...stack.current, page].slice(-20);
      setCanGoBack(stack.current.length > 1);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button || button.dataset.viewcashBack) return;
      if (suppress.current) { suppress.current = false; return; }
      recordPage(pageFromButton(button));
    };

    const observer = new MutationObserver(() => recordPage(pageFromHeading()));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", onClick, true);
    recordPage(pageFromHeading());
    return () => { observer.disconnect(); document.removeEventListener("click", onClick, true); };
  }, []);

  const goBack = () => {
    if (stack.current.length <= 1) return;
    const nextStack = stack.current.slice(0, -1);
    const previousPage = nextStack[nextStack.length - 1];
    stack.current = nextStack;
    setCanGoBack(nextStack.length > 1);
    const button = findPageButton(previousPage) || findPageButton("Home");
    if (button) { suppress.current = true; button.click(); }
  };

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      data-viewcash-back="true"
      onClick={goBack}
      aria-label="Go back"
      className="fixed left-3 top-3 z-[100] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-slate-100 shadow-lg backdrop-blur-md active:scale-95"
    >
      <ArrowLeft size={19} />
    </button>
  );
}
