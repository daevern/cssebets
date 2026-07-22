import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetPortal, SheetOverlay } from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Coins, Users2, Gift, ArrowUpRight, ArrowDownRight, X,
  ShoppingBag, MessageCircle,
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
        className="group relative flex shrink-0 items-center gap-1 rounded-full border border-surface-border bg-surface-2 px-2 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-neon/60 sm:gap-1.5 sm:px-2.5"
      >
        <span
          aria-hidden
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/12 ring-1 ring-inset ring-neon/40 text-neon"
        >
          <CsseMark className="h-3 w-3" />
        </span>
        <span className="tabular-nums leading-none">
          {summary.isLoading ? "…" : formatCompact(tokens)}
        </span>
        <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted leading-none">
          CSSE
        </span>
      </button>

      <TokenVaultSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vault sheet — modern bottom sheet tuned for mobile.                 */
/* ------------------------------------------------------------------ */
export function TokenVaultSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[55vh] max-h-[55vh] max-w-2xl flex-col rounded-t-2xl border border-surface-border bg-surface text-ink shadow-[0_-12px_40px_rgba(0,0,0,0.5)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-10 rounded-full bg-ink-muted/30" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 pt-2">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-neon/12 text-ink ring-1 ring-inset ring-neon/40">
                  <CsseMark className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neon">
                  CSSE Vault
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold leading-none tracking-tight tabular-nums text-ink">
                  {balance.toLocaleString()}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  tokens
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span>
                  Earned <span className="font-semibold tabular-nums text-ink">{lifetimeEarned.toLocaleString()}</span>
                </span>
                <span className="text-ink-muted/40">·</span>
                <span>
                  Spent <span className="font-semibold tabular-nums text-ink">{lifetimeSpent.toLocaleString()}</span>
                </span>
              </div>
            </div>
            <SheetPrimitive.Close
              aria-label="Close"
              className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-surface-border bg-surface-2 text-ink-muted transition-colors hover:border-neon/40 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </SheetPrimitive.Close>
          </div>

          {/* Top actions — 2 nav tiles + 1 read-only free-bet count */}
          <div className="mt-5 grid grid-cols-3 gap-3 px-5">
            <StatTile
              icon={<Users2 className="h-5 w-5" />}
              label="Invite"
              value={invites}
              to="/referrals"
              onNav={() => onOpenChange(false)}
            />
            <FreeBetTile count={availableFb} />
            <StatTile
              icon={<ShoppingBag className="h-5 w-5" />}
              label="Store"
              value="→"
              to="/store"
              onNav={() => onOpenChange(false)}
            />
          </div>

          {/* Full-width bottom action */}
          <div className="mt-3 px-5">
            <WhatsAppTile code={referral.data?.referralCode ?? null} />
          </div>

          {/* Ledger */}
          <div className="mt-5 flex flex-1 flex-col overflow-hidden px-5 pb-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Ledger
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted tabular-nums">
                {ledger.data?.length ?? 0} entries
              </div>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto rounded-xl border border-surface-border bg-surface-2/60 divide-y divide-surface-border">
              {ledger.isLoading && (
                <div className="py-8 text-center text-xs text-ink-muted">Loading ledger…</div>
              )}
              {!ledger.isLoading && (!ledger.data || ledger.data.length === 0) && (
                <div className="py-10 text-center">
                  <Coins className="mx-auto h-7 w-7 text-ink-muted/50" />
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    No token activity yet
                  </div>
                  <div className="mt-1 text-[11px] text-ink-muted">
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
      className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-surface-2 px-2 py-3 transition-all hover:border-neon/40 hover:bg-surface-2/80 active:scale-[0.98]"
    >
      <span className="text-ink-muted transition-colors group-hover:text-neon">
        {icon}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted transition-colors group-hover:text-ink">
        {label}
      </span>
      <span className="font-display text-base font-bold tabular-nums text-ink">
        {value}
      </span>
    </Link>
  );
}

function FreeBetTile({ count }: { count: number }) {
  const active = count > 0;
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 ${
        active
          ? "border-neon/40 bg-neon/[0.06]"
          : "border-surface-border bg-surface-2"
      }`}
      aria-label={`${count} free bets available`}
    >
      <span className={active ? "text-neon" : "text-ink-muted"}>
        <Gift className="h-5 w-5" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Free-bet
      </span>
      <span className={`font-display text-base font-bold tabular-nums ${active ? "text-neon" : "text-ink"}`}>
        {count}
      </span>
    </div>
  );
}

function WhatsAppTile({ code }: { code: string | null }) {
  const link = buildReferralLink(code);
  const disabled = !link;
  const onClick = () => {
    if (!link) return;
    const text = `Join me on CSSEBets — win real prizes from smart football predictions. Sign up with my link: ${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center justify-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3.5 transition-all hover:bg-[#25D366]/20 hover:border-[#25D366]/50 disabled:opacity-50 active:scale-[0.98]"
    >
      <MessageCircle className="h-5 w-5 shrink-0 text-[#25D366]" />
      <span className="text-sm font-semibold text-[#25D366]">Share on WhatsApp</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#25D366]" />
    </button>
  );
}

function LedgerRow({ row }: { row: any }) {
  const delta = Number(row.delta ?? 0);
  const positive = delta >= 0;
  const label = describeLedger(row);
  const when = new Date(row.created_at);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
          positive
            ? "border-neon/40 bg-neon/10 text-neon"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
      >
        {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ink-muted tabular-nums">
          {formatDate(when)} · Bal {Number(row.balance_after ?? 0).toLocaleString()}
        </div>
      </div>
      <div
        className={`font-display text-sm font-bold tabular-nums ${
          positive ? "text-neon" : "text-destructive"
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
