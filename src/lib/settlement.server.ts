// Server-only helpers for settling and voiding matches.
// Uses atomic Postgres RPCs to keep wallet + platform bankroll + predictions consistent.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function settlePredictionsForMatch(
  matchId: string,
  homeScore: number,
  awayScore: number,
  homeScoreHt: number | null = null,
  awayScoreHt: number | null = null,
) {
  // Wrapper settles existing markets (result/correct_score/total_goals/btts)
  // AND the new high-margin markets (over_under_2_5, btts via market_text,
  // correct_score grid, exact_total_goals, half_time_full_time).
  const { data, error } = await (supabaseAdmin as any).rpc("settle_match_all_markets_atomic", {
    p_match_id: matchId,
    p_home: homeScore,
    p_away: awayScore,
    p_home_ht: homeScoreHt,
    p_away_ht: awayScoreHt,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function voidMatch(matchId: string) {
  const { data, error } = await (supabaseAdmin as any).rpc("void_match_atomic", {
    p_match_id: matchId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}
