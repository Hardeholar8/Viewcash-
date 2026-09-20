"use client";

import { useEffect, useState } from "react";

type Wallet = "rewards" | "referral";

function formatData(mb: number) {
  return mb >= 1024
    ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 2)} GB`
    : `${mb.toLocaleString()} MB`;
}

export default function WithdrawPage() {
  const [initData, setInitData] = useState("");
  const [wallet, setWallet] = useState<Wallet>("rewards");
  const [balance, setBalance] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [unlockRequired, setUnlockRequired] = useState(10);
  const [qualifiedReferrals, setQualifiedReferrals] = useState(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) {
      setMessage("Open ViewCash from Telegram.");
      return;
    }

    tg.ready?.();
    tg.expand?.();
    setInitData(tg.initData);

    fetch("/api/telegram/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load data balance");
        }
        setBalance(Number(data.balance_mb || 0));
        setReferralBalance(Number(data.referral_balance_mb || 0));
        setUnlocked(Boolean(data.redemption_unlocked));
        setUnlockRequired(Number(data.referral_unlock_required || 10));
        setQualifiedReferrals(Number(data.qualified_referral_count || 0));
      })
      .catch((error) => {
        setMessage(error.message || "Unable to load data balance");
      });
  }, []);

  const available = wallet === "referral" ? referralBalance : balance;

  async function submit() {
    const mb = Math.floor(Number(amount));
    setMessage("");

    if (!Number.isInteger(mb) || mb < 100) {
      setMessage("Enter at least 100 MB.");
      return;
    }

    if (mb > available) {
      setMessage(`Insufficient data balance. Available: ${formatData(available)}.`);
      return;
    }

    if (!/^0[789]\d{9}$/.test(phone)) {
      setMessage("Enter a valid 11-digit Nigerian MTN number.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/data-redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          phone_number: phone,
          amount_mb: mb,
          balance_type: wallet === "referral" ? "referral" : "tasks",
        }),
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Redemption failed");
      }

      if (wallet === "referral") {
        setReferralBalance((value) => value - mb);
      } else {
        setBalance((value) => value - mb);
      }

      setAmount("");
      setMessage("Data redemption submitted successfully. It is pending fulfillment.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Redemption failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-6 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-yellow-400">
              MTN • ViewCash
            </p>
            <h1 className="mt-1 text-2xl font-black">Redeem Data</h1>
          </div>
          <button
            onClick={() => location.assign("/")}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold"
          >
            Back
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Available MTN data
          </p>
          <p className="mt-1 text-3xl font-black text-yellow-300">
            {formatData(available)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Minimum redemption: 100 MB
          </p>
        </div>

        {!unlocked ? <div className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-400/[.07] p-4"><p className="text-[10px] font-black uppercase tracking-[.18em] text-yellow-300">Redemption locked</p><h2 className="mt-1 text-lg font-black">Unlock MTN data redemption</h2><p className="mt-2 text-sm leading-5 text-slate-400">Complete the requirement of {unlockRequired} qualified referrals to open the data redemption portal.</p><p className="mt-3 text-xs font-bold text-yellow-200">{qualifiedReferrals}/{unlockRequired} qualified referrals</p><button onClick={() => location.assign("/")} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[.04] py-3 text-sm font-bold">Back to ViewCash</button></div> : <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setWallet("rewards")}
              className={`rounded-xl border py-2 text-xs font-bold ${wallet === "rewards" ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-white/[.03]"}`}
            >
              Earned Data
            </button>
            <button
              onClick={() => setWallet("referral")}
              className={`rounded-xl border py-2 text-xs font-bold ${wallet === "referral" ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-white/[.03]"}`}
            >
              Referral Data
            </button>
          </div>

          <input
            className="field"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
            }
            placeholder="MTN phone number"
            inputMode="numeric"
          />

          <div className="grid grid-cols-4 gap-2">
            {[100, 250, 500, 1024].map((value) => (
              <button
                key={value}
                onClick={() => setAmount(String(value))}
                className="rounded-xl border border-white/10 bg-white/[.03] py-2 text-xs font-bold"
              >
                {formatData(value)}
              </button>
            ))}
          </div>

          <input
            className="field"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/\\D/g, ""))
            }
            placeholder="Data amount in MB"
            inputMode="numeric"
          />

          <button
            disabled={busy}
            onClick={submit}
            className="w-full rounded-2xl bg-yellow-400 py-3 text-sm font-extrabold text-black disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Redeem MTN Data"}
          </button>
        </div>}

        {message && (
          <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-yellow-400/[.06] p-3 text-sm text-yellow-100">
            {message}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-slate-600">
          Your request is recorded for MTN data fulfillment.
        </p>
      </div>
    </main>
  );
}
