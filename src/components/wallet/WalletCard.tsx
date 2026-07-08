import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, ListOrdered, X } from "lucide-react";
import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
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
  // AMEX-style 4-6-6 grouping (16 digits total)
  return `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10, 16)}`;
}

/** Valid thru = created + 5 years, formatted MM/YY */
export function deriveValidThru(createdAt: string | undefined | null): string {
  if (!createdAt) return "--/--";
  const d = new Date(createdAt);
  const exp = new Date(d.getUTCFullYear() + 5, d.getUTCMonth(), 1);
  return `${pad(exp.getMonth() + 1, 2)}/${String(exp.getFullYear()).slice(-2)}`;
}

/** "Member since" — MM/YY of account creation */
export function deriveMemberSince(createdAt: string | undefined | null): string {
  if (!createdAt) return "--/--";
  const d = new Date(createdAt);
  return `${pad(d.getMonth() + 1, 2)}/${String(d.getFullYear()).slice(-2)}`;
}

/* ---------------- Card (visual) ---------------- */

export function WalletCreditCard({
  displayName,
  userId,
  createdAt,
  balance,
  reference,
}: {
  displayName: string | null;
  userId: string | null | undefined;
  createdAt: string | null | undefined;
  balance: number;
  reference?: string | null;
}) {
  const number = deriveWalletNumber(createdAt, userId);
  const validThru = deriveValidThru(createdAt);
  const memberSince = deriveMemberSince(createdAt);
  const cardholder = (displayName || "Player").toUpperCase();
  const memberRef = reference || `CSSE${(userId ?? "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  return (
    <div
      className="relative aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 p-5 text-white shadow-[0_25px_70px_-20px_rgba(0,0,0,0.75)]"
      style={{
        background:
          // AMEX-esque metallic emerald gradient using CSSE brand green
          "linear-gradient(135deg, #0a2a1f 0%, #0f4030 30%, #114a37 55%, #0a2418 100%)",
      }}
    >
      {/* Metallic sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(140% 60% at 15% 0%, rgba(255,255,255,0.14), transparent 55%), radial-gradient(120% 60% at 100% 100%, rgba(0,255,163,0.10), transparent 60%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)",
        }}
      />
      {/* Guilloché pattern (subtle) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, #fff 0 1px, transparent 1px 6px)",
        }}
      />

      <div className="relative flex h-full flex-col justify-between">
        {/* Top row: brand wordmark + chip */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.32em] text-[var(--neon)]/90">
              Member Points
            </div>
            <div className="mt-1">
              <CsseWordmark size={18} />
            </div>
          </div>
          {/* EMV-style chip */}
          <div
            aria-hidden
            className="grid h-8 w-11 place-items-center rounded-[6px] shadow-inner shadow-black/40"
            style={{
              background:
                "linear-gradient(135deg, #d4c37a 0%, #f4e6a1 40%, #b8a55d 100%)",
            }}
          >
            <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[1px] p-[3px]">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="rounded-[1px] bg-black/25" />
              ))}
            </div>
          </div>
        </div>

        {/* Card number — embossed */}
        <div
          className="font-mono text-[16px] sm:text-[18px] font-bold tabular-nums tracking-[0.14em] text-white"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.25), 0 2px 3px rgba(0,0,0,0.55)" }}
        >
          {formatCardNumber(number)}
        </div>

        {/* Member since / Valid thru row */}
        <div className="flex items-end justify-between gap-3 text-white">
          <div className="flex gap-5">
            <div>
              <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/60">Member Since</div>
              <div className="font-mono text-[11px] font-semibold tabular-nums leading-tight">{memberSince}</div>
            </div>
            <div>
              <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/60">Valid Thru</div>
              <div className="font-mono text-[11px] font-semibold tabular-nums leading-tight">{validThru}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/60">Balance</div>
            <div className="font-display text-base font-bold tabular-nums leading-tight text-[var(--neon)]">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[8px] font-bold uppercase tracking-widest text-white/70">pts</span>
            </div>
          </div>
        </div>

        {/* Cardholder + Member ID */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-bold uppercase tracking-[0.16em]"
              style={{ textShadow: "0 1px 0 rgba(255,255,255,0.2), 0 2px 3px rgba(0,0,0,0.55)" }}
            >
              {cardholder}
            </div>
            <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.3em] text-white/50">Cardholder</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] font-semibold tabular-nums text-white/90">{memberRef}</div>
            <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/50">Member ID</div>
          </div>
        </div>
      </div>

      {/* Corner mark accent */}
      <div className="pointer-events-none absolute -right-4 -bottom-4 opacity-[0.08]">
        <CsseMark className="h-28 w-28 text-white" />
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
    queryKey: ["my-profile-card", uid],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, public_reference")
        .eq("id", uid!)
        .maybeSingle();
      return {
        displayName: (data as any)?.display_name ?? null,
        reference: (data as any)?.public_reference ?? null,
      };
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
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--neon)]/12 ring-1 ring-inset ring-[var(--neon)]/40 text-[var(--neon)]">
              <CsseMark className="h-5 w-5" />
            </span>
            <SheetPrimitive.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/40 hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </SheetPrimitive.Close>
          </div>

          <div className="flex flex-col items-center gap-4 overflow-y-auto px-5 pb-6 pt-4">
            <WalletCreditCard
              displayName={profile.data?.displayName ?? (user?.email?.split("@")[0] ?? null)}
              userId={uid}
              createdAt={user?.created_at ?? null}
              balance={wallet.data?.balance ?? 0}
              reference={profile.data?.reference ?? wallet.data?.publicReference ?? null}
            />
            <WalletActions onNavigate={() => onOpenChange(false)} />
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
