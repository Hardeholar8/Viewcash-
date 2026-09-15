"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

type PageName = "Home" | "Watch Ads" | "Tasks" | "Wallet" | "Referral" | "Profile" | "Withdraw" | "History";

const pageNames: PageName[] = ["Home", "Watch Ads", "Tasks", "Wallet", "Referral", "Profile", "Withdraw", "History"];

function pageFromButton(button: HTMLButtonElement): PageName | null {
  const text = (button.textContent || "").replace(/\s+/g, " ").trim();
  if (text.includes("Transaction History")) return "History";
  for (const page of pageNames) {
    if (text === page || text.startsWith(`${page} `) || text.includes(page)) return page;
  }
  return null;
}

function findPageButton(page: PageName): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((button) => {
    if (button.dataset.viewcashBack) return false;
    return pageFromButton(button) === page;
  }) || null;
}

export default function ViewCashBackNavigation() {
  const stack = useRef<PageName[]>(["Home"]);
  const suppress = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button || button.dataset.viewcashBack) return;

      const page = pageFromButton(button);
      if (!page) return;

      if (suppress.current) {
        suppress.current = false;
        return;
      }

      const last = stack.current[stack.current.length - 1];
      if (last !== page) {
        stack.current = [...stack.current, page].slice(-20);
        setCanGoBack(stack.current.length > 1);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const goBack = () => {
    if (stack.current.length <= 1) return;

    const nextStack = stack.current.slice(0, -1);
    const previousPage = nextStack[nextStack.length - 1];
    stack.current = nextStack;
    setCanGoBack(nextStack.length > 1);

    const button = findPageButton(previousPage);
    if (button) {
      suppress.current = true;
      button.click();
      return;
    }

    const homeButton = findPageButton("Home");
    if (homeButton) {
      suppress.current = true;
      homeButton.click();
    }
  };

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      data-viewcash-back="true"
      onClick={goBack}
      aria-label="Go back"
      className="fixed left-3 top-3 z-[70] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/90 text-slate-100 shadow-lg backdrop-blur-md active:scale-95"
    >
      <ArrowLeft size={19} />
    </button>
  );
}
