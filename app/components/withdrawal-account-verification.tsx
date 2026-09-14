"use client";

import { useEffect } from "react";

export default function WithdrawalAccountVerification() {
  useEffect(() => {
    let disposed = false;
    let banks: { code: string; name: string }[] = [];
    let banksPromise: Promise<void> | null = null;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const loadBanks = async () => {
      if (banks.length) return;
      if (banksPromise) return banksPromise;
      banksPromise = fetch("/api/banks", { cache: "no-store" })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || "Unable to load banks");
          banks = Array.isArray(d.banks) ? d.banks : [];
        })
        .finally(() => { banksPromise = null; });
      return banksPromise;
    };

    const enhance = async () => {
      if (disposed || window.location.pathname !== "/") return;
      const selects = Array.from(document.querySelectorAll("select"));
      const walletSelect = selects.find((s) => Array.from(s.options).some((o) => o.value === "tasks" && o.textContent?.includes("Task Wallet")));
      if (!walletSelect) return;
      const bankInput = document.querySelector<HTMLInputElement>('input[placeholder="Bank name"]');
      const accountNameInput = document.querySelector<HTMLInputElement>('input[placeholder="Account name"]');
      const accountNumberInput = document.querySelector<HTMLInputElement>('input[placeholder="Account number"]');
      if (!bankInput || !accountNameInput || !accountNumberInput) return;
      await loadBanks().catch(() => undefined);
      if (!banks.length || disposed) return;

      let bankSearch = document.querySelector<HTMLInputElement>('input[data-viewcash-bank-search="true"]');
      let bankList = document.querySelector<HTMLDivElement>('[data-viewcash-bank-list="true"]');

      if (!bankSearch) {
        bankSearch = document.createElement("input");
        bankSearch.type = "text";
        bankSearch.setAttribute("data-viewcash-bank-search", "true");
        bankSearch.className = bankInput.className + " w-full";
        bankSearch.placeholder = "Search bank...";
        bankInput.parentElement?.insertBefore(bankSearch, bankInput);
        bankInput.style.display = "none";

        bankList = document.createElement("div");
        bankList.setAttribute("data-viewcash-bank-list", "true");
        bankList.className = "mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 p-1";
        bankSearch.parentElement?.insertBefore(bankList, bankInput);

        const renderBanks = () => {
          if (!bankList || !bankSearch) return;
          const query = bankSearch.value.trim().toLowerCase();
          const matches = banks.filter((b) => b.name.toLowerCase().includes(query)).slice(0, 20);
          bankList.innerHTML = "";
          if (!matches.length) {
            const empty = document.createElement("div");
            empty.className = "px-3 py-2 text-xs text-slate-500";
            empty.textContent = "No bank found";
            bankList.appendChild(empty);
            return;
          }
          matches.forEach((bank) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10";
            button.textContent = bank.name;
            button.addEventListener("click", () => {
              bankSearch!.value = bank.name;
              bankInput!.value = bank.name;
              bankInput!.dispatchEvent(new Event("input", { bubbles: true }));
              bankList!.innerHTML = "";
              accountNameInput!.value = "";
              accountNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
              setStatus("Bank selected. Enter your 10-digit account number.", false);
            });
            bankList!.appendChild(button);
          });
        };

        bankSearch.addEventListener("input", renderBanks);
        bankSearch.addEventListener("focus", renderBanks);
        renderBanks();
      }

      accountNameInput.readOnly = true;
      accountNameInput.disabled = false;
      accountNameInput.placeholder = "Verified account name";
      accountNameInput.style.opacity = "0.8";

      let status = document.querySelector<HTMLDivElement>('[data-viewcash-account-status="true"]');
      if (!status) {
        status = document.createElement("div");
        status.setAttribute("data-viewcash-account-status", "true");
        status.className = "mt-1 text-xs";
        accountNameInput.parentElement?.appendChild(status);
      }
      const setStatus = (text: string, success: boolean) => {
        if (!status) return;
        status.textContent = text;
        status.className = `mt-1 text-xs ${success ? "text-emerald-300" : "text-slate-500"}`;
      };

      if (accountNumberInput.getAttribute("data-viewcash-bound") !== "true") {
        accountNumberInput.setAttribute("data-viewcash-bound", "true");
        accountNumberInput.addEventListener("input", () => {
          if (verifyTimer) clearTimeout(verifyTimer);
          accountNameInput!.value = "";
          accountNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
          if (accountNumberInput!.value.length !== 10 || !bankInput!.value) {
            setStatus("Search and select a bank, then enter your 10-digit account number.", false);
            return;
          }
          setStatus("Verifying account details...", false);
          verifyTimer = setTimeout(async () => {
            try {
              const selectedBank = banks.find((b) => b.name.toLowerCase() === bankInput!.value.toLowerCase());
              if (!selectedBank) throw new Error("BANK_NOT_SELECTED");
              const r = await fetch("/api/verify-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_number: accountNumberInput!.value, bank_code: selectedBank.code }), cache: "no-store" });
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d.account_name) throw new Error(d.error || "ACCOUNT_NOT_VERIFIED");
              accountNameInput!.value = d.account_name;
              accountNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
              setStatus("Account verified successfully.", true);
            } catch {
              accountNameInput!.value = "";
              accountNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
              setStatus("Account details could not be verified. Check the bank and account number.", false);
            }
          }, 500);
        });
      }

      const submitButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "Submit withdrawal");
      if (submitButton && submitButton.getAttribute("data-viewcash-withdraw-bound") !== "true") {
        submitButton.setAttribute("data-viewcash-withdraw-bound", "true");
        submitButton.type = "button";
        submitButton.addEventListener("click", () => {
          const amountInput = document.querySelector<HTMLInputElement>('input[placeholder*="coins to withdraw"]');
          const amount = Number(amountInput?.value || 0);
          const walletText = walletSelect?.value === "affiliate" ? "Affiliate" : "Task";
          const walletCards = Array.from(document.querySelectorAll("p")).filter((p) => p.textContent?.includes("🪙"));
          const selectedCard = walletCards.find((p) => p.parentElement?.parentElement?.textContent?.includes(`${walletText} Wallet`));
          const available = selectedCard ? Number((selectedCard.textContent || "").replace(/[^0-9.]/g, "")) : NaN;

          if (!bankSearch?.value.trim()) {
            setStatus("Search for and select your bank before submitting.", false);
            bankSearch?.focus();
            return;
          }
          if (!/^\d{10}$/.test(accountNumberInput.value)) {
            setStatus("Enter a valid 10-digit account number.", false);
            return;
          }
          if (!accountNameInput.value.trim()) {
            setStatus("Verify your account details before submitting.", false);
            return;
          }
          if (!Number.isInteger(amount) || amount <= 0) {
            setStatus("Enter a valid coin amount.", false);
            return;
          }
          if (Number.isFinite(available) && amount > available) {
            setStatus(`Insufficient ${walletText.toLowerCase()} wallet coins.`, false);
            return;
          }
          setStatus("Submitting withdrawal request...", false);
        }, true);
      }

      if (!bankSearch.value && bankInput.value) bankSearch.value = bankInput.value;
      if (!accountNumberInput.value || accountNumberInput.value.length !== 10) setStatus("Search and select a bank, then enter your 10-digit account number.", false);
    };

    observer = new MutationObserver(() => { void enhance(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void enhance();
    return () => { disposed = true; if (verifyTimer) clearTimeout(verifyTimer); observer?.disconnect(); };
  }, []);
  return null;
}
