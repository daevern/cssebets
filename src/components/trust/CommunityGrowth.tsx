import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommunityGrowth } from "@/lib/trust.functions";
import { StencilPanel } from "@/components/ui/page-shell";
import { IconCommunity } from "@/components/trust/TrustIcons";
import { UpdatedLive } from "@/components/trust/EmptyState";

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-dashed border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold leading-none tabular-nums text-[var(--color-ink)]">
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}

export function CommunityGrowth() {
  const fn = useServerFn(getCommunityGrowth);
  const q = useQuery({
    queryKey: ["trust", "growth"],
    queryFn: () => fn({}),
    staleTime: 60_000,
  });
  const d = q.data;
  const total = (d?.members_this_month ?? 0) + (d?.bets_this_month ?? 0) + (d?.payouts_this_month ?? 0);

  return (
    <StencilPanel
      kicker={<><IconCommunity className="h-3 w-3" /> Community Growth</>}
      meta={d ? <UpdatedLive at={d.updated_at} /> : null}
    >
      <div className="grid grid-cols-3 gap-2">
        <Cell label="New members" value={d?.members_this_month ?? 0} />
        <Cell label="Bets this month" value={d?.bets_this_month ?? 0} />
        <Cell label="Payouts done" value={d?.payouts_this_month ?? 0} />
      </div>
      {total === 0 && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          Every community starts somewhere. Thank you for helping build CSSEBets.
        </p>
      )}
    </StencilPanel>
  );
}
