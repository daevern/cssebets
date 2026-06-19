import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecentActivity } from "@/lib/trust.functions";
import { StencilPanel } from "@/components/ui/page-shell";
import { IconBroadcast } from "@/components/trust/TrustIcons";
import { EmptyState, UpdatedLive } from "@/components/trust/EmptyState";

const KIND_COPY: Record<string, { tag: string; verb: string; tone: string }> = {
  bet_placed: { tag: "Bet", verb: "placed a bet", tone: "text-[var(--color-ink-muted)]" },
  bet_won: { tag: "Win", verb: "won a bet", tone: "text-[var(--color-neon)]" },
  payout_requested: { tag: "Payout", verb: "requested a payout", tone: "text-[var(--color-ink-muted)]" },
  payout_completed: { tag: "Paid", verb: "received a payout", tone: "text-[var(--color-neon)]" },
  points_approved: { tag: "Points", verb: "received approved points", tone: "text-[var(--color-neon)]" },
};

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function ActivityFeed() {
  const fn = useServerFn(getRecentActivity);
  const q = useQuery({
    queryKey: ["trust", "activity"],
    queryFn: () => fn({}),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const rows = q.data ?? [];

  return (
    <StencilPanel
      kicker={<><IconBroadcast className="h-3 w-3" /> Recent Platform Activity</>}
      meta={q.dataUpdatedAt ? <UpdatedLive at={q.dataUpdatedAt} /> : null}
    >
      {q.isLoading ? (
        <EmptyState message="Loading activity" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconBroadcast className="h-8 w-8" />}
          message="Quiet on the wire — be the first to make a move."
        />
      ) : (
        <ul className="divide-y divide-dashed divide-[var(--color-surface-border)]">
          {rows.map((r, i) => {
            const m = KIND_COPY[r.kind] ?? KIND_COPY.bet_placed;
            return (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`inline-flex h-5 min-w-[44px] items-center justify-center border border-current px-1.5 text-[9px] font-bold uppercase tracking-[0.18em] ${m.tone}`}>
                    {m.tag}
                  </span>
                  <span className="truncate text-sm">
                    <span className="font-bold text-[var(--color-ink)]">{r.who}</span>
                    <span className="text-[var(--color-ink-muted)]"> {m.verb}</span>
                  </span>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  {relTime(r.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        Names masked for member privacy.
      </p>
    </StencilPanel>
  );
}
