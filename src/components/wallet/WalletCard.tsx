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
import { CashoutSheet } from "@/components/wallet/CashoutSheet";
import { TopUpAmountModal } from "@/components/wallet/TopUpAmountModal";

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
      className="relative aspect-[1.586/1] w-full max-w-sm select-none overflow-hidden rounded-2xl text-white shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85),0_2px_0_0_rgba(255,255,255,0.06)_inset]"
      style={{
        background:
          // Deep emerald metallic — CSSE aesthetic
          "radial-gradient(120% 90% at 0% 0%, #14503a 0%, #0c3626 35%, #061c14 75%, #030d09 100%)",
      }}
    >
      {/* Outer bevel / border */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 0 2px rgba(0,0,0,0.35)",
        }}
      />

      {/* Diagonal metallic sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0.02) 54%, transparent 70%)",
        }}
      />

      {/* Neon corner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--neon), transparent 70%)" }}
      />

      {/* Guilloché — fine engraved lines */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(38deg, #ffffff 0 1px, transparent 1px 5px), repeating-linear-gradient(-38deg, #ffffff 0 1px, transparent 1px 5px)",
        }}
      />

      {/* Circuit-trace pattern (CSSE nod) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10] mix-blend-screen"
        viewBox="0 0 400 250"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="currentColor" strokeWidth="0.6" className="text-[var(--neon)]">
          <path d="M0 40 L120 40 L140 60 L240 60 L260 40 L400 40" />
          <path d="M0 120 L60 120 L80 140 L200 140 L220 120 L400 120" />
          <path d="M0 210 L140 210 L160 190 L400 190" />
          <circle cx="140" cy="60" r="2" />
          <circle cx="240" cy="60" r="2" />
          <circle cx="200" cy="140" r="2" />
          <circle cx="160" cy="190" r="2" />
        </g>
      </svg>

      {/* Faint giant CSSE mark watermark */}
      <div className="pointer-events-none absolute -right-8 -bottom-10 opacity-[0.07]">
        <CsseMark className="h-48 w-48 text-white" />
      </div>

      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        {/* Row 1 — brand + chip + NFC */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-bold uppercase tracking-[0.36em] text-[var(--neon)]/90">
              Member Points
            </div>
            <div className="mt-1.5">
              <CsseWordmark size={18} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Contactless / NFC */}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5 -rotate-90 text-white/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M5 8c3 2 3 6 0 8" />
              <path d="M9 5c5 3 5 11 0 14" />
              <path d="M13 2c7 4 7 16 0 20" />
            </svg>

            {/* EMV chip — detailed */}
            <div
              aria-hidden
              className="relative h-8 w-11 overflow-hidden rounded-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.4),0_1px_0_rgba(255,255,255,0.15)]"
              style={{
                background:
                  "linear-gradient(135deg, #b7994a 0%, #f4e3a1 35%, #d6b95c 55%, #8c6f2a 100%)",
              }}
            >
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    className="border border-black/30"
                    style={{ boxShadow: "inset 0 0 3px rgba(0,0,0,0.35)" }}
                  />
                ))}
              </div>
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/30" />
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/30" />
            </div>
          </div>
        </div>

        {/* Row 2 — card number, embossed */}
        <div
          className="font-mono text-[15px] sm:text-[17px] font-bold tabular-nums tracking-[0.16em] text-white"
          style={{
            textShadow:
              "0 1px 0 rgba(255,255,255,0.28), 0 2px 4px rgba(0,0,0,0.6)",
          }}
        >
          {formatCardNumber(number)}
        </div>

        {/* Row 3 — dates */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex gap-5">
            <div>
              <div className="text-[6.5px] font-bold uppercase tracking-[0.32em] text-white/55">
                Member Since
              </div>
              <div className="font-mono text-[11px] font-semibold tabular-nums leading-tight">
                {memberSince}
              </div>
            </div>
            <div>
              <div className="text-[6.5px] font-bold uppercase tracking-[0.32em] text-white/55">
                Valid Thru
              </div>
              <div className="font-mono text-[11px] font-semibold tabular-nums leading-tight">
                {validThru}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[6.5px] font-bold uppercase tracking-[0.32em] text-white/55">
              Balance
            </div>
            <div className="font-display text-base font-bold tabular-nums leading-tight text-[var(--neon)]">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[8px] font-bold uppercase tracking-widest text-white/70">
                pts
              </span>
            </div>
          </div>
        </div>

        {/* Row 4 — cardholder + holo seal + member ID */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-bold uppercase tracking-[0.18em]"
              style={{
                textShadow:
                  "0 1px 0 rgba(255,255,255,0.22), 0 2px 3px rgba(0,0,0,0.6)",
              }}
            >
              {cardholder}
            </div>
            <div className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.34em] text-white/45">
              Cardholder
            </div>
          </div>

          {/* Holographic seal */}
          <div
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-white/25"
            style={{
              background:
                "conic-gradient(from 210deg, #7ef0c1, #35a37a, #0d3a2b, #7ef0c1, #35a37a, #7ef0c1)",
              boxShadow:
                "inset 0 0 6px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            <CsseMark className="h-4 w-4 text-black/70" />
          </div>

          <div className="text-right">
            <div className="font-mono text-[11px] font-semibold tabular-nums text-white/95">
              {memberRef}
            </div>
            <div className="text-[7px] font-bold uppercase tracking-[0.34em] text-white/45">
              Member ID
            </div>
          </div>
        </div>
      </div>

      {/* Micro-print border along bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-1 truncate text-[5px] font-semibold uppercase tracking-[0.4em] text-white/25"
      >
        cssebets · member points card · non-transferable · secured by csse · cssebets · member points
      </div>
    </div>
  );
}

/* ---------------- Actions ---------------- */

export function WalletActions({ onNavigate }: { onNavigate?: () => void }) {
  const [cashoutOpen, setCashoutOpen] = useState(false);
  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/wallet"
          onClick={onNavigate}
          className="group flex items-center justify-center gap-2 rounded-xl border border-[var(--neon)]/50 bg-[var(--neon)]/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--neon)] transition-all hover:bg-[var(--neon)]/15 active:scale-[0.98]"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Top-up
        </Link>
        <button
          type="button"
          onClick={() => setCashoutOpen(true)}
          className="group flex items-center justify-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink)] transition-all hover:border-[var(--neon)]/40 active:scale-[0.98]"
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Cashout
        </button>
      </div>
      <Link
        to="/wallet/transaction-list"
        onClick={onNavigate}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)] transition-all hover:border-[var(--neon)]/40 hover:text-[var(--ink)] active:scale-[0.98]"
      >
        <ListOrdered className="h-4 w-4" />
        Transaction list
      </Link>
      <CashoutSheet
        open={cashoutOpen}
        onOpenChange={setCashoutOpen}
        onNavigateAway={onNavigate}
      />
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
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--neon)]/12 ring-1 ring-inset ring-[var(--neon)]/40 text-[var(--neon)]">
                <CsseMark className="h-5 w-5" />
              </span>
              <SheetPrimitive.Title className="text-sm font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
                My Wallet
              </SheetPrimitive.Title>
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
