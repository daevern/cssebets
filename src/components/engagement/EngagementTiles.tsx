import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Gift, Users2, Copy, Check, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getMyEngagementSummary } from "@/lib/engagement.functions";
import { getMyReferralOverview } from "@/lib/referrals.functions";
import { listMyFreeBets } from "@/lib/freebets.functions";
import { buildReferralLink } from "@/lib/referral-link";

export function EngagementTiles() {
  const eFn = useServerFn(getMyEngagementSummary);
  const rFn = useServerFn(getMyReferralOverview);
  const fbFn = useServerFn(listMyFreeBets);

  const engagement = useQuery({ queryKey: ["engagement-summary"], queryFn: () => eFn(), staleTime: 30_000 });
  const referral = useQuery({ queryKey: ["referral-overview"], queryFn: () => rFn(), staleTime: 30_000 });
  const freeBets = useQuery({ queryKey: ["my-free-bets"], queryFn: () => fbFn(), staleTime: 30_000 });

  const tokens = engagement.data?.tokens.balance ?? 0;
  const levelLabel = engagement.data?.level.label ?? "Rookie";
  const refCode = referral.data?.referralCode ?? null;
  const invites = referral.data?.totalReferrals ?? 0;
  const availableFB = freeBets.data?.available?.length ?? 0;

  const [copied, setCopied] = useState(false);
  async function copyRef() {
    if (!refCode) return;
    const link = buildReferralLink(refCode);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <section aria-labelledby="engagement-heading" className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 id="engagement-heading" className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
          Rewards & Referrals
        </h2>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--neon)]">{levelLabel}</span>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Link
          to="/store"
          className="group flex flex-col justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)] p-3 transition-colors hover:border-[var(--neon)]/60"
        >
          <Coins className="h-4 w-4 text-[var(--neon)]" />
          <div>
            <div className="mt-2 font-display text-lg font-bold leading-none">{tokens.toLocaleString()}</div>
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">CSSE Tokens</div>
          </div>
        </Link>

        <Link
          to="/referrals"
          className="group flex flex-col justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)] p-3 transition-colors hover:border-[var(--neon)]/60"
        >
          <Users2 className="h-4 w-4 text-[var(--neon)]" />
          <div>
            <div className="mt-2 font-display text-lg font-bold leading-none">{invites}</div>
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Invites</div>
          </div>
        </Link>

        <Link
          to={availableFB > 0 ? "/free-bets/place" : "/store"}
          className="group flex flex-col justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)] p-3 transition-colors hover:border-[var(--neon)]/60"
        >
          <Gift className="h-4 w-4 text-[var(--neon)]" />
          <div>
            <div className="mt-2 font-display text-lg font-bold leading-none">{availableFB}</div>
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Free Bets</div>
          </div>
        </Link>
      </div>

      {refCode ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-surface-border)] bg-[var(--surface-3)] px-3 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Code</span>
          <span className="font-mono text-sm font-bold text-[var(--ink)]">{refCode}</span>
          <button
            type="button"
            onClick={copyRef}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--color-surface-border)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)] hover:border-[var(--neon)]/60"
          >
            {copied ? <Check className="h-3 w-3 text-[var(--neon)]" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}

      <Link
        to="/store"
        className="mt-3 flex items-center justify-between rounded-xl border border-[var(--neon)]/40 bg-[var(--neon)]/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--neon)] transition-colors hover:bg-[var(--neon)]/10"
      >
        <span>Open store</span>
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
