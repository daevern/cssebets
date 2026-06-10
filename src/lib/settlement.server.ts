// Server-only helpers for settling and voiding matches.
// Uses atomic Postgres RPCs to keep wallet + platform bankroll + predictions consistent.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function settlePredictionsForMatch(matchId: string, homeScore: number, awayScore: number) {
  const { data, error } = await (supabaseAdmin as any).rpc("settle_match_atomic", {
    p_match_id: matchId,
    p_home_score: homeScore,
    p_away_score: awayScore,
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
