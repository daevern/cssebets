import { MatchAnalyticsScreen } from "@/routes/_authenticated/matches.$matchId";
import { getFootballEventAnalytics } from "../football-analytics.functions";
import { FootballMarketTabs } from "../components/FootballMarketTabs";
import { MarketAnalyticsCard } from "@/components/matches/MarketAnalyticsCard";
import {
  getFootballMarketHistory,
  getFootballRecentTrades,
} from "../football-market-history.functions";

/**
 * Club-football match page — a 1:1 reuse of the World Cup `/matches/$matchId`
 * screen: same hero, same market-movement chart (with range picker, legend
 * filtering and live trade tape), same market tabs, odds buttons and stake
 * slip — pointed at football's own odds, history and bet placement.
 */
export function FootballMatchDetailsPage({ matchId }: { matchId: string }) {
  return (
    <MatchAnalyticsScreen
      matchId={matchId}
      analyticsFn={getFootballEventAnalytics}
      queryKey="football-analytics"
      breadcrumbLabel="Football"
      realtime={false}
      analyticsCard={
        <MarketAnalyticsCard
          matchId={matchId}
          historyFn={getFootballMarketHistory}
          tradesFn={getFootballRecentTrades}
          queryNamespace="football"
          realtime
          realtimeChannels={[
            { table: "sports_odds_snapshots", filter: `sports_event_id=eq.${matchId}` },
          ]}
        />
      }
      marketsSlot={<FootballMarketTabs matchId={matchId} />}
    />
  );
}
