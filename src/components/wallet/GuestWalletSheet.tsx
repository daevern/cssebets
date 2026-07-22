import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, ArrowDownCircle, ArrowUpCircle, Landmark, Smartphone, Wallet as WalletIcon, Clock } from "lucide-react";

type Tab = "menu" | "topup" | "cashout";

export function GuestWalletSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("menu");
  if (!open) return null;
  const close = () => {
    setTab("menu");
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] text-[var(--ink)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-surface-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <WalletIcon className="h-4 w-4 text-[var(--neon)]" />
            <span className="text-sm font-bold tracking-tight">Wallet</span>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tab === "menu" && (
          <div className="p-5">
            <div className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Guest balance
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">0.00 pts</div>
              <div className="mt-1 text-[11px] text-[var(--ink-muted)]">
                Create an account to activate your wallet.
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setTab("topup")}
                className="flex flex-col items-start gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-4 text-left transition-colors hover:border-[var(--neon)]/50"
              >
                <ArrowDownCircle className="h-5 w-5 text-[var(--neon)]" />
                <span className="text-sm font-bold">Top up</span>
                <span className="text-[11px] text-[var(--ink-muted)]">Methods & duration</span>
              </button>
              <button
                onClick={() => setTab("cashout")}
                className="flex flex-col items-start gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-4 text-left transition-colors hover:border-[var(--neon)]/50"
              >
                <ArrowUpCircle className="h-5 w-5 text-[var(--neon)]" />
                <span className="text-sm font-bold">Cash out</span>
                <span className="text-[11px] text-[var(--ink-muted)]">Points to cash</span>
              </button>
            </div>
            <Link
              to="/register"
              className="mt-4 block rounded-xl bg-[var(--neon)] px-4 py-3 text-center text-sm font-bold text-[#04140A]"
            >
              Create free account
            </Link>
          </div>
        )}

        {tab === "topup" && (
          <div className="p-5">
            <button
              onClick={() => setTab("menu")}
              className="mb-3 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              ← Back
            </button>
            <h3 className="text-base font-bold">Top-up methods</h3>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Deposits are credited as points at 1 MYR = 1 pt.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <Method icon={<Landmark className="h-4 w-4" />} name="Bank transfer (FPX / DuitNow)" time="≈ 5 minutes" />
              <Method icon={<Smartphone className="h-4 w-4" />} name="Touch 'n Go eWallet" time="Instant" />
              <Method icon={<Clock className="h-4 w-4" />} name="Manual review (large deposits)" time="Up to 1 hour" />
            </ul>
            <Link
              to="/register"
              className="mt-5 block rounded-xl bg-[var(--neon)] px-4 py-3 text-center text-sm font-bold text-[#04140A]"
            >
              Create account to top up
            </Link>
          </div>
        )}

        {tab === "cashout" && (
          <div className="p-5">
            <button
              onClick={() => setTab("menu")}
              className="mb-3 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              ← Back
            </button>
            <h3 className="text-base font-bold">Cash out</h3>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Convert winnings back to MYR at 1 pt = 1 MYR.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <Method icon={<Landmark className="h-4 w-4" />} name="Bank transfer to your registered account" time="1–3 business days" />
              <Method icon={<Clock className="h-4 w-4" />} name="Compliance review (first cash-out)" time="Up to 24 hours" />
            </ul>
            <div className="mt-4 rounded-lg border border-dashed border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-3 text-[11px] text-[var(--ink-muted)]">
              Minimum cash-out: <span className="font-mono font-bold text-[var(--ink)]">500 pts</span>. No conversion fees.
            </div>
            <Link
              to="/register"
              className="mt-5 block rounded-xl bg-[var(--neon)] px-4 py-3 text-center text-sm font-bold text-[#04140A]"
            >
              Create account to cash out
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Method({ icon, name, time }: { icon: React.ReactNode; name: string; time: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--neon)]">
          {icon}
        </span>
        <span className="truncate text-[13px] font-semibold">{name}</span>
      </div>
      <span className="shrink-0 text-[11px] font-mono text-[var(--ink-muted)]">{time}</span>
    </li>
  );
}
