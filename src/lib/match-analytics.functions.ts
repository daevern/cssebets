// Server function exposed to the client: returns a full analytics bundle
// for a single match. Reads from cached tables; triggers an on-demand
// refresh only when cached data is stale and the match is in a phase where
// new data could be available.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LineupPlayer = {
  id: number | null;
  name: string;
  number: number | null;
  pos: string | null;
  grid: string | null;
};

export type AnalyticsBundle = {
  match: {
    id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    status: string;
    stage: string | null;
    group_name: string | null;
    home_score: number | null;
    away_score: number | null;
    ft_home_score: number | null;
    ft_away_score: number | null;
    penalty_home_score: number | null;
    penalty_away_score: number | null;
    venue: string | null;
    referee: string | null;
    apifootball_fixture_id: number | null;
  } | null;
  phase: "pre" | "lineups" | "live" | "finished";
  lineups: {
    home: any | null;
    away: any | null;
  };
  events: any[];
  stats: { home: any | null; away: any | null };
  ratings: { home: any[]; away: any[] };
  h2h: any[];
  injuries: { home: any[]; away: any[] };
  teamForm: { home: any | null; away: any | null };
};

export const getMatchAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { fetchMatchAnalytics } = await import("@/lib/match-analytics.server");
    return fetchMatchAnalytics(data.matchId);
  });

// Public variant for the visitor-facing landing page. Reads the same cached
// analytics tables — no privileged data is exposed.
export const getMatchAnalyticsPublic = createServerFn({ method: "POST" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { fetchMatchAnalytics } = await import("@/lib/match-analytics.server");
    return fetchMatchAnalytics(data.matchId);
  });
