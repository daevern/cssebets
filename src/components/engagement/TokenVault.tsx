import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Coins, Users2, Gift, ArrowUpRight, ArrowDownRight, X,
  ShoppingBag,
} from "lucide-react";
import { getMyEngagementSummary, listMyTokenTransactions } from "@/lib/engagement.functions";
import { getMyReferralOverview } from "@/lib/referrals.functions";
import { listMyFreeBets } from "@/lib/freebets.functions";
import { useAuth } from "@/hooks/use-auth";
import { CsseMark } from "@/components/brand/CsseMark";
import { buildReferralLink } from "@/lib/referral-link";

/* ------------------------------------------------------------------ */
/* Chip — sits in the top nav next to the wallet PTS chip.             */
/* ------------------------------------------------------------------ */
export function TokenChip() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const eFn = useServerFn(getMyEngagementSummary);
  const summary = useQuery({
    queryKey: ["engagement-summary", uid],
    queryFn: () => eFn(),
    staleTime: 30_000,
    enabled: !!user,
  });
  const tokens = summary.data?.tokens.balance ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open CSSE token vault"
        className="group relative flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] px-2 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/60 sm:gap-1.5 sm:px-2.5"
      >
        <span
          aria-hidden
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--neon)]/12 ring-1 ring-inset ring-[var(--neon)]/40 text-[var(--neon)]"
        >
          <CsseMark className="h-3 w-3" />
        </span>
        <span className="tabular-nums leading-none">
          {summary.isLoading ? "…" : formatCompact(tokens)}
        </span>
        <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)] leading-none">
          CSSE
        </span>
      </button>

      <TokenVaultSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vault sheet — same visual language as the "Lock Prediction" slip.   */
/* ------------------------------------------------------------------ */
function TokenVaultSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const eFn = useServerFn(getMyEngagementSummary);
  const rFn = useServerFn(getMyReferralOverview);
  const fbFn = useServerFn(listMyFreeBets);
  const txFn = useServerFn(listMyTokenTransactions);

  const summary = useQuery({ queryKey: ["engagement-summary", uid], queryFn: () => eFn(), enabled: open && !!user, staleTime: 30_000 });
  const referral = useQuery({ queryKey: ["referral-overview", uid], queryFn: () => rFn(), enabled: open && !!user, staleTime: 30_000 });
  const freeBets = useQuery({ queryKey: ["my-free-bets", uid], queryFn: () => fbFn(), enabled: open && !!user, staleTime: 30_000 });
  const ledger = useQuery({ queryKey: ["my-token-ledger", uid], queryFn: () => txFn(), enabled: open && !!user, staleTime: 15_000 });

  const balance = summary.data?.tokens.balance ?? 0;
  const lifetimeEarned = summary.data?.tokens.lifetime_earned ?? 0;
  const lifetimeSpent = summary.data?.tokens.lifetime_spent ?? 0;
  const invites = referral.data?.totalReferrals ?? 0;
  const availableFb = freeBets.data?.available?.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay className="bg-black/70" />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92vh] max-w-2xl flex-col rounded-t-lg border border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] shadow-[0_-8px_24px_rgba(0,0,0,0.6)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Header — mirrors StakeSlip "Your prediction" block */}
          <div className="flex items-start justify-between gap-2 px-4 pt-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
                CSSE Vault
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[32px] font-bold leading-none tabular-nums text-[var(--color-ink)]">
                  {balance.toLocaleString()}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                  tokens
                </span>
              </div>
              <div className="text-[11px] text-[var(--color-ink-muted)]">
                Earned <span className="font-semibold tabular-nums text-[var(--color-ink)]">{lifetimeEarned.toLocaleString()}</span>
                <span className="mx-1.5 text-[var(--color-ink-muted)]/60">·</span>
                Spent <span className="font-semibold tabular-nums text-[var(--color-ink)]">{lifetimeSpent.toLocaleString()}</span>
              </div>
            </div>
            <SheetPrimitive.Close
              aria-label="Close"
              className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </SheetPrimitive.Close>
          </div>

          {/* Stat trio — matches Return/Gain tile pattern */}
          <div className="mt-3 grid grid-cols-3 gap-2 px-4">
            <StatTile
              icon={<Users2 className="h-3.5 w-3.5" />}
              label="Invites"
              value={invites}
              to="/referrals"
              onNav={() => onOpenChange(false)}
            />
            <StatTile
              icon={<Gift className="h-3.5 w-3.5" />}
              label="Free bets"
              value={availableFb}
              to={availableFb > 0 ? "/free-bets/place" : "/store"}
              onNav={() => onOpenChange(false)}
            />
            <StatTile
              icon={<ShoppingBag className="h-3.5 w-3.5" />}
              label="Store"
              value="→"
              to="/store"
              onNav={() => onOpenChange(false)}
            />
          </div>

          {/* Ledger */}
          <div className="mt-4 flex flex-1 flex-col overflow-hidden px-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                Ledger
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] tabular-nums">
                {ledger.data?.length ?? 0} entries
              </div>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 divide-y divide-[var(--color-surface-border)]/60">
              {ledger.isLoading && (
                <div className="py-8 text-center text-xs text-[var(--color-ink-muted)]">Loading ledger…</div>
              )}
              {!ledger.isLoading && (!ledger.data || ledger.data.length === 0) && (
                <div className="py-10 text-center">
                  <Coins className="mx-auto h-6 w-6 text-[var(--color-ink-muted)]/60" />
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                    No token activity yet
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                    Place bets or invite friends to start earning.
                  </div>
                </div>
              )}
              {(ledger.data ?? []).map((row: any) => (
                <LedgerRow key={row.id} row={row} />
              ))}
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
  icon, label, value, to, onNav,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  to: string;
  onNav: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNav}
      className="group flex items-center justify-between rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 px-2.5 py-2 transition-colors hover:border-[var(--color-neon)]/60"
    >
      <div className="flex items-center gap-1.5 text-[var(--color-ink-muted)] group-hover:text-[var(--color-neon)]">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <span className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
        {value}
      </span>
    </Link>
  );
}

function LedgerRow({ row }: { row: any }) {
  const delta = Number(row.delta ?? 0);
  const positive = delta >= 0;
  const label = describeLedger(row);
  const when = new Date(row.created_at);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
          positive
            ? "border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
      >
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--color-ink)]">{label}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)] tabular-nums">
          {formatDate(when)} · Bal {Number(row.balance_after ?? 0).toLocaleString()}
        </div>
      </div>
      <div
        className={`font-display text-[13px] font-bold tabular-nums ${
          positive ? "text-[var(--color-neon)]" : "text-destructive"
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
