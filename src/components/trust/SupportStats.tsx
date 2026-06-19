import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupportStats } from "@/lib/trust.functions";
import { IconSupport } from "@/components/brand/NavIcons";
import { UpdatedLive } from "@/components/trust/EmptyState";

function fmtHours(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

export function SupportStats() {
  const fn = useServerFn(getSupportStats);
  const q = useQuery({
    queryKey: ["trust", "support-stats"],
    queryFn: () => fn({}),
    staleTime: 60_000,
  });
  const d = q.data;

  return (
    <div className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          <IconSupport className="h-3 w-3" /> Support Response
        </span>
        {q.dataUpdatedAt ? <UpdatedLive at={q.dataUpdatedAt} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Cell label="Open" value={d?.open ?? 0} />
        <Cell label="In review" value={d?.in_review ?? 0} />
        <Cell label="Awaiting you" value={d?.awaiting_user ?? 0} />
        <Cell label="Resolved" value={d?.resolved ?? 0} />
        <Cell label="Avg response" value={fmtHours(d?.avg_first_response_hours)} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-dashed border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-display text-base font-bold leading-none tabular-nums text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}
