import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Coins, Users2, Gift, ArrowUpRight, ArrowDownRight, X,
  Sparkles, TrendingUp, ShoppingBag,
} from "lucide-react";
import { getMyEngagementSummary, listMyTokenTransactions } from "@/lib/engagement.functions";
import { getMyReferralOverview } from "@/lib/referrals.functions";
import { listMyFreeBets } from "@/lib/freebets.functions";

/* ------------------------------------------------------------------ */
/* Chip — sits in the top nav next to the wallet PTS chip.             */
/* ------------------------------------------------------------------ */
export function TokenChip() {
  const [open, setOpen] = useState(false);
  const eFn = useServerFn(getMyEngagementSummary);
  const summary = useQuery({
    queryKey: ["engagement-summary"],
    queryFn: () => eFn(),
    staleTime: 30_000,
  });
  const tokens = summary.data?.tokens.balance ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open CSSE token vault"
        className="group relative flex items-center gap-1.5 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/60"
      >
        <span
          aria-hidden
          className="grid h-4 w-4 place-items-center rounded-full bg-[var(--neon)]/12 ring-1 ring-inset ring-[var(--neon)]/40"
        >
          <span className="text-[9px] font-black leading-none text-[var(--neon)]">◈</span>
        </span>
        <span className="tabular-nums leading-none">
          {summary.isLoading ? "…" : formatCompact(tokens)}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)] leading-none">
          CSSE
        </span>
      </button>

      <TokenVaultSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vault sheet — bottom-anchored on mobile, side on desktop.           */
/* ------------------------------------------------------------------ */
function TokenVaultSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const eFn = useServerFn(getMyEngagementSummary);
  const rFn = useServerFn(getMyReferralOverview);
  const fbFn = useServerFn(listMyFreeBets);
  const txFn = useServerFn(listMyTokenTransactions);

  const summary = useQuery({ queryKey: ["engagement-summary"], queryFn: () => eFn(), enabled: open, staleTime: 30_000 });
  const referral = useQuery({ queryKey: ["referral-overview"], queryFn: () => rFn(), enabled: open, staleTime: 30_000 });
  const freeBets = useQuery({ queryKey: ["my-free-bets"], queryFn: () => fbFn(), enabled: open, staleTime: 30_000 });
  const ledger = useQuery({ queryKey: ["my-token-ledger"], queryFn: () => txFn(), enabled: open, staleTime: 15_000 });

  const balance = summary.data?.tokens.balance ?? 0;
  const lifetimeEarned = summary.data?.tokens.lifetime_earned ?? 0;
  const lifetimeSpent = summary.data?.tokens.lifetime_spent ?? 0;
  const level = summary.data?.level?.label ?? "Rookie";
  const nextLevel = summary.data?.levels?.find((l) => l.min > lifetimeEarned);
  const invites = referral.data?.totalReferrals ?? 0;
  const activeInvites = referral.data?.activeReferrals ?? 0;
  const availableFb = freeBets.data?.available?.length ?? 0;
  const allFb = freeBets.data?.all?.length ?? 0;

  const progress = nextLevel
    ? Math.min(100, Math.round((lifetimeEarned / nextLevel.min) * 100))
    : 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay className="bg-black/70 backdrop-blur-sm" />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col border-t border-[var(--neon)]/30 bg-[#050B08] text-[var(--ink)] shadow-[0_-30px_80px_-20px_rgba(34,224,107,0.35)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--color-surface-border)]/70" />

          {/* Header */}
          <div className="relative px-5 pt-3 pb-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.20), transparent 65%)",
              }}
            />
            {/* Corner brackets */}
            <span aria-hidden className="pointer-events-none absolute top-3 left-3 h-2.5 w-2.5 border-t border-l border-[var(--neon)]/60" />
            <span aria-hidden className="pointer-events-none absolute top-3 right-3 h-2.5 w-2.5 border-t border-r border-[var(--neon)]/60" />

            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--neon)]">
                  CSSE Token Vault
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-[44px] font-black leading-none tabular-nums">
                    {balance.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                    tokens
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                  <Sparkles className="h-3 w-3 text-[var(--neon)]" />
                  <span className="text-[var(--neon)]">{level}</span>
                  {nextLevel ? (
                    <>
                      <span className="text-[var(--ink-muted)]/60">·</span>
                      <span>{(nextLevel.min - lifetimeEarned).toLocaleString()} to {nextLevel.label}</span>
                    </>
                  ) : (
                    <span>Max tier</span>
                  )}
                </div>
              </div>
              <SheetPrimitive.Close
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-surface-border)] text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/50 hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </SheetPrimitive.Close>
            </div>

            {/* Progress rail */}
            <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-border)]/50">
              <div
                className="h-full rounded-full bg-[var(--neon)] shadow-[0_0_12px_var(--color-neon-glow)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)] tabular-nums">
              <span>Earned {lifetimeEarned.toLocaleString()}</span>
              <span>Spent {lifetimeSpent.toLocaleString()}</span>
            </div>
          </div>

          {/* Scroll body */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {/* Stat trio */}
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                icon={<Users2 className="h-3.5 w-3.5" />}
                label="Invites"
                value={invites}
                sub={`${activeInvites} active`}
                to="/referrals"
                onNav={() => onOpenChange(false)}
              />
              <StatTile
                icon={<Gift className="h-3.5 w-3.5" />}
                label="Free bets"
                value={availableFb}
                sub={`${allFb} total`}
                to={availableFb > 0 ? "/free-bets/place" : "/store"}
                onNav={() => onOpenChange(false)}
              />
              <StatTile
                icon={<ShoppingBag className="h-3.5 w-3.5" />}
                label="Store"
                value={"→"}
                sub="Spend"
                to="/store"
                onNav={() => onOpenChange(false)}
              />
            </div>

            {/* Ledger */}
            <div className="mt-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--ink-muted)]">
                    Ledger
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    Every token in, every token out.
                  </div>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--neon)]">
                  {ledger.data?.length ?? 0} entries
                </div>
              </div>

              <div className="mt-3 divide-y divide-[var(--color-surface-border)]/60 border-y border-[var(--color-surface-border)]/60">
                {ledger.isLoading && (
                  <div className="py-8 text-center text-xs text-[var(--ink-muted)]">Loading ledger…</div>
                )}
                {!ledger.isLoading && (!ledger.data || ledger.data.length === 0) && (
                  <div className="py-10 text-center">
                    <Coins className="mx-auto h-6 w-6 text-[var(--ink-muted)]/60" />
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                      No token activity yet
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--ink-muted)]">
                      Place bets or invite friends to start earning.
                    </div>
                  </div>
                )}
                {(ledger.data ?? []).map((row: any) => (
                  <LedgerRow key={row.id} row={row} />
                ))}
              </div>
            </div>
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */
function StatTile({
  icon, label, value, sub, to, onNav,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  to: string;
  onNav: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNav}
      className="group relative overflow-hidden rounded-xl border border-[var(--color-surface-border)] bg-[#070D0A] p-3 transition-colors hover:border-[var(--neon)]/60"
    >
      <span aria-hidden className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 border-t border-r border-[var(--neon)]/50" />
      <div className="flex items-center gap-1.5 text-[var(--neon)]">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.22em]">{label}</span>
      </div>
      <div className="mt-2 font-display text-xl font-black leading-none tabular-nums text-[var(--ink)]">
        {value}
      </div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
        {sub}
      </div>
    </Link>
  );
}

function LedgerRow({ row }: { row: any }) {
  const delta = Number(row.delta ?? 0);
  const positive = delta >= 0;
  const label = describeLedger(row);
  const when = new Date(row.created_at);
  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
          positive
            ? "border-[var(--neon)]/40 bg-[var(--neon)]/10 text-[var(--neon)]"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
      >
        {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[var(--ink)]">{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          <span>{formatDate(when)}</span>
          <span className="text-[var(--ink-muted)]/60">·</span>
          <span>Bal {Number(row.balance_after ?? 0).toLocaleString()}</span>
        </div>
      </div>
      <div
        className={`font-display text-[15px] font-black tabular-nums ${
          positive ? "text-[var(--neon)]" : "text-destructive"
        }`}
      >
        {positive ? "+" : ""}
        {delta.toLocaleString()}
      </div>
    </div>
  );
}

function describeLedger(row: any) {
  const kind: string = row.kind ?? "";
  const source: string = row.source ?? "";
  const meta = row.metadata ?? {};
  const stage = meta.stage;
  if (kind === "referral_milestone" || source.startsWith("referral")) {
    if (stage) return `Referral milestone · Stage ${stage}`;
    return "Referral milestone reward";
  }
  if (kind === "wager_earn" || source === "wager") return "Wagering reward";
  if (kind === "signup_bonus") return "Welcome bonus";
  if (kind === "admin_grant" || source === "admin") return meta.reason ? `Admin grant · ${meta.reason}` : "Admin grant";
  if (kind === "store_purchase" || source === "store") {
    return meta.stake_amount ? `Free bet purchased · ${meta.stake_amount} pts` : "Store purchase";
  }
  if (kind === "adjustment") return meta.reason ?? "Adjustment";
  return kind.replace(/_/g, " ") || "Token movement";
}

function formatDate(d: Date) {
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86_400_000;
  if (diff < day) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)}d ago`;
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatCompact(n: number) {
  if (n < 1000) return n.toString();
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1_000_000) return Math.round(n / 1000) + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}
