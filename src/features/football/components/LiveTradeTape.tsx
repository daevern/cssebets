import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNowStrict } from "date-fns";
import { getFootballTradeTape } from "../football.functions";

export default function LiveTradeTape({ eventId }: { eventId: string }) {
  const fetcher = useServerFn(getFootballTradeTape);
  const { data, isLoading } = useQuery({
    queryKey: ["football-trade-tape", eventId],
    queryFn: () => fetcher({ data: { eventId, limit: 20 } }),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-4">
        <div className="h-4 w-24 rounded bg-white/10 animate-pulse mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const trades = data?.trades ?? [];

  return (
    <div className="rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-[var(--ink)]">Live trade tape</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
            Anonymized · last {trades.length} bets
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)] animate-pulse" />
          live
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="text-xs text-[var(--ink-muted)]">
          No bets yet on this match. Be the first.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {trades.map((t, i) => (
            <li
              key={`${t.placedAt}-${i}`}
              className="flex items-center justify-between gap-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[var(--ink)]">
                  {humanMarket(t.marketKey)}
                </div>
                <div className="truncate text-[10px] text-[var(--ink-muted)]">
                  {humanSelection(t.selectionKey)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular-nums font-semibold text-[var(--neon)]">
                  @ {t.odds.toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--ink-muted)] tabular-nums">
                  {t.stakeBucket} · {timeAgo(t.placedAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function humanMarket(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function humanSelection(k: string) {
  return k.replace(/_/g, " ");
}
function timeAgo(iso: string) {
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "";
  }
}
