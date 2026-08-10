import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useMemo, useState } from "react";
import { getFootballMatch } from "../football.functions";

const OddsHistoryGraph = lazy(() => import("./OddsHistoryGraph"));
const LiveTradeTape = lazy(() => import("./LiveTradeTape"));

/** Market-movement panel for club football — mirrors the World Cup
 *  MarketAnalyticsCard (price history + live trade tape), reading from the
 *  sports_markets odds history instead of the legacy match markets. */
export function FootballMarketMovement({ matchId }: { matchId: string }) {
  const fetcher = useServerFn(getFootballMatch);
  const { data } = useQuery({
    queryKey: ["football-match", matchId],
    queryFn: () => fetcher({ data: { matchId } }),
    refetchInterval: 60_000,
  });

  const markets = data?.markets ?? [];
  const primary = useMemo(
    () =>
      markets.find((m: any) => m.key === "1x2" || m.key === "match_winner") ??
      markets[0] ??
      null,
    [markets],
  );
  const [marketId, setMarketId] = useState<string | null>(null);
  const active = markets.find((m: any) => m.id === marketId) ?? primary;

  if (!active) return null;

  const labels: Record<string, string> = {};
  for (const s of active.selections) labels[s.key] = s.displayName;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] md:text-xl">
          Market movement
        </h2>
        {markets.length > 1 && (
          <select
            value={active.id}
            onChange={(e) => setMarketId(e.target.value)}
            aria-label="Choose market"
            className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-ink)]"
          >
            {markets.slice(0, 25).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        )}
      </div>

      <Suspense
        fallback={<div className="h-24 animate-pulse rounded-lg bg-white/[0.03]" />}
      >
        <OddsHistoryGraph marketId={active.id} selectionLabels={labels} />
      </Suspense>

      <Suspense fallback={null}>
        <LiveTradeTape eventId={matchId} />
      </Suspense>
    </section>
  );
}
