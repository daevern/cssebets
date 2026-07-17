// Public (any authenticated user) trigger for football-data sync.
// Used by the matches page on mount + on a short interval so finished
// matches are reflected without waiting for an admin to click Sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runFootballDataSync } = await import("@/lib/sync.server");
    return runFootballDataSync({ userId: context.userId });
  });

export const getMatchOddsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("match_odds_snapshots")
      .select("id, sampled_at, home_odds, draw_odds, away_odds, source")
      .eq("match_id", data.matchId)
      .gte("sampled_at", oneDayAgo)
      .order("sampled_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMatchesForUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status, home_score, away_score, stage, group_name, reference_odds, odds_updated_at, odds_source, is_simulation, odds_status, suspended_markets, manual_override")
      .or("is_simulation.is.null,is_simulation.eq.false")
      .ilike("stage", "FIFA World Cup%")
      .order("kickoff_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map(({ is_simulation: _is, ...rest }: any) => rest);
  });
