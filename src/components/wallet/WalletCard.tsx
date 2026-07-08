import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, ListOrdered, X } from "lucide-react";
import { CsseLogo, CsseMark } from "@/components/brand/CsseMark";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyWallet } from "@/lib/wallet.functions";

/* ---------------- helpers ---------------- */

function pad(n: number, len: number) {
  return n.toString().padStart(len, "0");
}

/** Derive a stable 16-digit "card number" from account created date + userID */
export function deriveWalletNumber(createdAt: string | undefined | null, userId: string | undefined | null): string {
  const d = createdAt ? new Date(createdAt) : new Date(0);
  const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`; // 8 digits
  const hex = (userId ?? "").replace(/-/g, "").slice(0, 8).padEnd(8, "0");
  const uidDigits = hex.split("").map((c) => (parseInt(c, 16) || 0) % 10).join("");
  return (dateStr + uidDigits).slice(0, 16);
}

export function formatCardNumber(n: string): string {
  return (n.match(/.{1,4}/g) ?? [n]).join(" ");
}

/** Valid thru = created + 5 years, formatted MM/YY */
export function deriveValidThru(createdAt: string | undefined | null): string {
  if (!createdAt) return "--/--";
  const d = new Date(createdAt);
  const exp = new Date(d.getUTCFullYear() + 5, d.getUTCMonth(), 1);
  return `${pad(exp.getMonth() + 1, 2)}/${String(exp.getFullYear()).slice(-2)}`;
}

/* ---------------- Card (visual) ---------------- */

export function WalletCreditCard({
  displayName,
  userId,
  createdAt,
  balance,
}: {
  displayName: string | null;
  userId: string | null | undefined;
  createdAt: string | null | undefined;
  balance: number;
}) {
  const number = deriveWalletNumber(createdAt, userId);
  const validThru = deriveValidThru(createdAt);

  return (
    <div className="relative aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-surface-border)] p-5 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
      style={{
        background:
          "linear-gradient(135deg, #0a1512 0%, #0f2a20 45%, #071a13 100%)",
      }}
    >
      {/* Neon shine */}
      <div
        aria-hidden
        className="absolute -inset-1 opacity-40"
        style={{
          background:
            "radial-gradient(120% 60% at 0% 0%, rgba(0,255,163,0.18), transparent 60%), radial-gradient(120% 60% at 100% 100%, rgba(0,255,163,0.12), transparent 60%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        {/* Top row: brand + balance chip */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--neon)]/15 ring-1 ring-inset ring-[var(--neon)]/40 text-[var(--neon)]">
              <CsseMark className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--neon)]">CSSEBets</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/60">Points Wallet</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/60">Balance</div>
            <div className="font-display text-xl font-bold tabular-nums leading-tight">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-[var(--neon)]">pts</span>
            </div>
          </div>
        </div>

        {/* Card number */}
        <div className="font-mono text-[15px] sm:text-lg font-semibold tabular-nums tracking-[0.15em] text-white/95">
          {formatCardNumber(number)}
        </div>

        {/* Bottom row: name + valid thru + user id */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/50">Cardholder</div>
            <div className="truncate text-sm font-semibold uppercase tracking-wider">
              {displayName || "Player"}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono">
              ID {(userId ?? "").slice(0, 8).toUpperCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/50">Valid thru</div>
            <div className="font-mono text-sm font-semibold tabular-nums">{validThru}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Actions ---------------- */

export function WalletActions({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/wallet/top-up"
          onClick={onNavigate}
          className="group flex items-center justify-center gap-2 rounded-xl border border-[var(--neon)]/50 bg-[var(--neon)]/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--neon)] transition-all hover:bg-[var(--neon)]/15 active:scale-[0.98]"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Top-up
        </Link>
        <Link
          to="/payout"
          onClick={onNavigate}
          className="group flex items-center justify-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink)] transition-all hover:border-[var(--neon)]/40 active:scale-[0.98]"
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Cashout
        </Link>
      </div>
      <Link
        to="/wallet/transaction-list"
        onClick={onNavigate}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)] transition-all hover:border-[var(--neon)]/40 hover:text-[var(--ink)] active:scale-[0.98]"
      >
        <ListOrdered className="h-4 w-4" />
        Transaction list
      </Link>
    </div>
  );
}

/* ---------------- Chip + Sheet ---------------- */

export function WalletChip({ balance, loading }: { balance?: number | null; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  if (balance == null) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open wallet"
        className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-2 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/40 sm:gap-1.5 sm:px-3 md:py-2 md:text-[13px]"
      >
        <WalletIcon className="h-3.5 w-3.5 shrink-0 text-[var(--neon)] md:h-4 md:w-4" />
        <span className="tabular-nums">{loading ? "…" : balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">PTS</span>
      </button>
      <WalletCardSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function WalletCardSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const uid = user?.id;
  const wFn = useServerFn(getMyWallet);

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid && open,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const profile = useQuery({
    queryKey: ["my-profile-name", uid],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", uid!).maybeSingle();
      return (data as any)?.display_name ?? null;
    },
    enabled: !!uid && open,
    staleTime: 60_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay className="bg-black/70" />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80vh] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--color-surface-border)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-10 rounded-full bg-[var(--ink-muted)]/30" />
          </div>

          <div className="flex items-center justify-between px-5 pt-1">
            <div className="flex items-center gap-2">
              <CsseLogo size={20} />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--neon)]">
                My wallet
              </span>
            </div>
            <SheetPrimitive.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/40 hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </SheetPrimitive.Close>
          </div>

          <div className="flex flex-col items-center gap-4 overflow-y-auto px-5 pb-6 pt-4">
            <WalletCreditCard
              displayName={profile.data ?? (user?.email?.split("@")[0] ?? null)}
              userId={uid}
              createdAt={user?.created_at ?? null}
              balance={wallet.data?.balance ?? 0}
            />
            <WalletActions onNavigate={() => onOpenChange(false)} />
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
