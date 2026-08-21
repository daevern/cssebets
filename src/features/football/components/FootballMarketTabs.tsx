import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MarketTabs } from "@/components/matches/MarketTabs";
import {
  getFootballMatch,
  listMyFootballOpenBetsForEvent,
  placeFootballBet,
} from "../football.functions";

type OddsRow = { id: string; market: string; selection: string; odds: number };

/* ------------------------------------------------------------------ */
/* Club-football market/selection keys -> World Cup catalog keys       */
/* ------------------------------------------------------------------ */
function mapMarketKey(key: string): string | null {
  if (key === "match_result") return "1x2";
  if (key === "double_chance") return "double_chance";
  if (key === "draw_no_bet") return "draw_no_bet";
  if (key === "btts") return "btts";
  if (key === "goals_odd_even") return "goals_odd_even";
  if (key === "exact_goals") return "exact_total_goals";
  if (key === "home_clean_sheet") return "clean_sheet_home";
  if (key === "away_clean_sheet") return "clean_sheet_away";
  if (key === "correct_score") return "correct_score";
  if (key === "half_time_full_time" || key === "ht_ft") return "half_time_full_time";
  const total = key.match(/^total_goals_(\d+_\d+)$/);
  if (total) return `over_under_${total[1]}`;
  const cards = key.match(/^total_cards_(\d+_\d+)$/);
  if (cards) return `cards_over_under_${cards[1]}`;
  const corners = key.match(/^total_corners_(\d+_\d+)$/);
  if (corners) return `corners_over_under_${corners[1]}`;
  if (key === "home_corners_4_5") return "home_corners_over_under_4_5";
  if (key === "away_corners_4_5") return "away_corners_over_under_4_5";
  if (key === "home_cards_1_5") return "home_cards_over_under_1_5";
  if (key === "away_cards_1_5") return "away_cards_over_under_1_5";
  if (key === "red_card_match") return "red_card_match";
  return null;
}


function mapSelectionKey(catalogMarket: string, key: string): string | null {
  const k = key.toLowerCase();
  if (catalogMarket === "1x2") {
    if (k === "home" || k === "draw" || k === "away") return k;
    return null;
  }
  if (catalogMarket === "double_chance") {
    if (k === "1x") return "HOME_OR_DRAW";
    if (k === "12") return "HOME_OR_AWAY";
    if (k === "x2") return "DRAW_OR_AWAY";
    return null;
  }
  if (catalogMarket === "draw_no_bet") {
    if (k === "home") return "HOME";
    if (k === "away") return "AWAY";
    return null;
  }
  if (catalogMarket === "goals_odd_even") {
    if (k === "odd") return "ODD";
    if (k === "even") return "EVEN";
    return null;
  }
  if (catalogMarket === "exact_total_goals") {
    const m = k.match(/^exact_(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n === 5) return "GOALS_5_PLUS";
      return n > 5 ? null : `GOALS_${n}`;
    }
    if (k === "exact_6_plus" || k === "exact_5_plus") return "GOALS_5_PLUS";
    return null;
  }
  if (k === "yes") return "YES";
  if (k === "no") return "NO";
  const ou = k.match(/^(over|under)_(\d+_\d+)$/);
  if (ou) return `${ou[1].toUpperCase()}_${ou[2]}`;
  return key.toUpperCase();
}

/**
 * Renders the exact World Cup betting surface (`MarketTabs`) for a club
 * football fixture — same tabs, odds buttons, colours and stake slip — by
 * translating `sports_markets` rows into the World Cup odds shape and routing
 * placement through `placeFootballBet`.
 */
export function FootballMarketTabs({ matchId }: { matchId: string }) {
  const qc = useQueryClient();
  const fetcher = useServerFn(getFootballMatch);
  const { data, isLoading } = useQuery({
    queryKey: ["football-match", matchId],
    queryFn: () => fetcher({ data: { matchId } }),
    refetchInterval: 30_000,
  });

  const openBetsFetcher = useServerFn(listMyFootballOpenBetsForEvent);
  const openBetsQ = useQuery({
    queryKey: ["football-my-bets", matchId],
    queryFn: () => openBetsFetcher({ data: { eventId: matchId } }),
    refetchInterval: 60_000,
  });

  const placeBet = useServerFn(placeFootballBet);

  // catalogMarket:catalogSelection -> { marketId, selectionId, odds }
  const { rows, index, suspended } = useMemo(() => {
    const rows: OddsRow[] = [];
    const index = new Map<string, { marketId: string; selectionId: string; odds: number }>();
    const suspended: string[] = [];
    for (const m of (data?.markets ?? []) as any[]) {
      const catalogMarket = mapMarketKey(m.key);
      if (!catalogMarket) continue;
      if (m.status !== "open" || m.isStale) suspended.push(catalogMarket);
      for (const s of m.selections ?? []) {
        const sel = mapSelectionKey(catalogMarket, s.key);
        if (!sel) continue;
        rows.push({
          id: `${m.id}::${s.id}`,
          market: catalogMarket,
          selection: sel,
          odds: Number(s.odds),
        });
        index.set(`${catalogMarket}:${sel}`, {
          marketId: m.id,
          selectionId: s.id,
          odds: Number(s.odds),
        });
      }
    }
    return { rows, index, suspended };
  }, [data]);

  const placedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const b of openBetsQ.data?.openSelections ?? []) {
      const catalogMarket = mapMarketKey(b.marketKey);
      if (!catalogMarket) continue;
      const sel = mapSelectionKey(catalogMarket, b.selectionKey);
      if (!sel) continue;
      set.add(`${catalogMarket}:${sel}`);
    }
    return set;
  }, [openBetsQ.data, rows]);

  const match = data?.match;
  const isClosed = !!match && ["finished", "postponed", "cancelled", "abandoned"].includes(match.status);

  return (
    <>
      {isClosed && (
        <div className="mb-3 rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/40 p-4 text-sm text-[var(--color-ink-muted)]">
          Betting is closed on this match.{" "}
          {match?.status === "finished" ? "Awaiting settlement." : ""}
        </div>
      )}
      <MarketTabs
        matchId={matchId}
        locked={false}
        bettingBlocked={isClosed}
        suspendedMarkets={suspended}
        homeTeam={match?.home.name}
        awayTeam={match?.away.name}
        externalOdds={rows}
        externalLoading={isLoading}
        externalPlacedKeys={placedKeys}
        onExternalPlace={async ({ market, selection, odds, stake, clientRequestId }) => {
          const target = index.get(`${market}:${selection}`);
          if (!target) throw new Error("Selection unavailable");
          const res = await placeBet({
            data: {
              eventId: matchId,
              marketId: target.marketId,
              selectionId: target.selectionId,
              stake,
              maxOdds: Math.max(1.01, Number((odds * 1.05).toFixed(2))),
              idempotencyKey: clientRequestId,
            },
          });
          qc.invalidateQueries({ queryKey: ["football-my-bets", matchId] });
          qc.invalidateQueries({ queryKey: ["football-match", matchId] });
          return res;
        }}
      />
    </>
  );
}
