import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformPulse } from "@/lib/trust.functions";
import { StencilPanel } from "@/components/ui/page-shell";
import { IconPulse } from "@/components/trust/TrustIcons";
import { EmptyState, UpdatedLive } from "@/components/trust/EmptyState";

function fmt(n: number | null | undefined) {
  if (n == null) return null;
  return Math.round(Number(n)).toLocaleString("en-US");
}
function fmtHours(h: number | null | undefined) {
  if (h == null) return null;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="border border-dashed border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold leading-none tabular-nums text-[var(--color-ink)]">
        {value ?? <span className="text-[var(--color-ink-muted)]">—</span>}
      </div>
      {sub && (
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-neon)]/70">
          {sub}
        </div>
      )}
    </div>
  );
}

export function PlatformPulse() {
  const fn = useServerFn(getPlatformPulse);
  const q = useQuery({
    queryKey: ["trust", "pulse"],
    queryFn: () => fn({}),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });

  const d = q.data;
  const hasAnyActivity = d && (d.registered_members > 0 || d.bets_placed > 0);

  return (
    <StencilPanel
      kicker={<><IconPulse className="h-3 w-3" /> Platform Pulse</>}
      meta={d ? <UpdatedLive at={d.updated_at} /> : null}
    >
      {q.isLoading ? (
        <EmptyState message="Loading platform pulse" />
      ) : !hasAnyActivity ? (
        <EmptyState icon={<IconPulse className="h-8 w-8" />} message="Collecting platform statistics" />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Members" value={fmt(d.registered_members)} />
          <Stat label="Active 30d" value={fmt(d.active_members_30d)} />
          <Stat label="Bets placed" value={fmt(d.bets_placed)} />
          <Stat label="Bets settled" value={fmt(d.bets_settled)} />
          <Stat label="Payouts paid" value={fmt(d.approved_payouts)} />
          <Stat label="Points paid out" value={fmt(d.total_points_paid_out)} sub="pts" />
          <Stat label="Avg payout" value={fmtHours(d.avg_payout_processing_hours)} sub="processing" />
          <Stat label="Avg points review" value={fmtHours(d.avg_point_approval_hours)} sub="approval" />
        </div>
      )}
    </StencilPanel>
  );
}
