import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPayoutPerformance } from "@/lib/trust.functions";
import { StencilPanel } from "@/components/ui/page-shell";
import { IconShield } from "@/components/trust/TrustIcons";
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

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border border-dashed border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold leading-none tabular-nums text-[var(--color-ink)]">
        {value ?? <span className="text-[var(--color-ink-muted)]">—</span>}
      </div>
    </div>
  );
}

export function PayoutPerformance() {
  const fn = useServerFn(getPayoutPerformance);
  const q = useQuery({
    queryKey: ["trust", "payout-perf"],
    queryFn: () => fn({}),
    staleTime: 60_000,
  });
  const d = q.data;
  const hasHistory = d && d.total_completed >= 3;

  return (
    <StencilPanel
      kicker={<><IconShield className="h-3 w-3" /> Payout Performance</>}
      meta={d ? <UpdatedLive at={d.updated_at} /> : null}
    >
      {q.isLoading ? (
        <EmptyState message="Loading payout history" />
      ) : !hasHistory ? (
        <EmptyState
          icon={<IconShield className="h-8 w-8" />}
          message="Building payout history"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cell label="Avg processing" value={fmtHours(d.avg_processing_hours)} />
          <Cell label="Completed" value={fmt(d.total_completed)} />
          <Cell label="Largest paid" value={fmt(d.largest_completed)} />
          <Cell
            label="Success rate"
            value={d.success_rate != null ? `${Math.round(d.success_rate * 100)}%` : null}
          />
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
        Every payout request is manually reviewed for account security.
      </p>
    </StencilPanel>
  );
}
