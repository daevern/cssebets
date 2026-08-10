import { MatchAnalyticsScreen } from "@/routes/_authenticated/matches.$matchId";
import { getFootballEventAnalytics } from "../football-analytics.functions";
import { FootballMarketsSection } from "../components/FootballMarketsSection";
import { FootballMarketMovement } from "../components/FootballMarketMovement";

/**
 * Club-football match page. Reuses the exact World Cup analytics screen
 * (`/matches/$matchId`) — same hero, market-movement chart, timeline, team
 * sheets, ratings, injuries and H2H — with football's own markets and odds
 * history plugged into the market slots.
 */
export function FootballMatchDetailsPage({ matchId }: { matchId: string }) {
  return (
    <MatchAnalyticsScreen
      matchId={matchId}
      analyticsFn={getFootballEventAnalytics}
      queryKey="football-analytics"
      breadcrumbLabel="Football"
      realtime={false}
      analyticsCard={<FootballMarketMovement matchId={matchId} />}
      marketsSlot={<FootballMarketsSection matchId={matchId} />}
    />
  );
}
