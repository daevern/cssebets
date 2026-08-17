// Server-only helpers for settling and voiding matches.
// Uses atomic Postgres RPCs to keep wallet + platform bankroll + predictions consistent.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { regulationSettleBlockReason } from "@/lib/settlement-guards";

export async function settlePredictionsForMatch(
  matchId: string,
  homeScore: number,
  awayScore: number,
  homeScoreHt: number | null = null,
  awayScoreHt: number | null = null,
  qualifier: "HOME" | "AWAY" | null = null,
) {
  // Defensive guard (2026-07-04): 90-minute markets MUST settle on regulation.
  // If the caller accidentally passes the ET aggregate (ft_home_score) for a
  // match that went to extra time, refuse rather than mis-settling wallets.
  const { data: m } = await (supabaseAdmin as any)
    .from("matches")
    .select("home_score, away_score, ft_home_score, ft_away_score")
    .eq("id", matchId)
    .maybeSingle();
  if (m) {
    const blocked = regulationSettleBlockReason(m, homeScore, awayScore);
    if (blocked) {
      const msg = `Refusing to settle match ${matchId} on non-regulation score ${homeScore}-${awayScore}. Regulation is ${m.home_score}-${m.away_score}, aggregate is ${m.ft_home_score}-${m.ft_away_score}. 90-minute markets grade on regulation.`;
      console.error("[settlement]", msg);
      try {
        await (supabaseAdmin as any).from("operational_alerts").insert({
          category: "settlement",
          severity: "critical",
          title: "Blocked settlement on wrong score basis",
          detail: msg,
          metadata: {
            match_id: matchId,
            passed_home: homeScore,
            passed_away: awayScore,
            reg_home: m.home_score,
            reg_away: m.away_score,
            ft_home: m.ft_home_score,
            ft_away: m.ft_away_score,
            guard: blocked,
          },
        });
      } catch {}
      throw new Error(msg);
    }
  }
  // Settles every market: 90-min (result, O/U, BTTS, CS, exact goals, HT/FT)
  // plus to_qualify (graded on who advances after ET + penalties).
  const { data, error } = await (supabaseAdmin as any).rpc("settle_match_all_markets_atomic", {
    p_match_id: matchId,
    p_home: homeScore,
    p_away: awayScore,
    p_home_ht: homeScoreHt,
    p_away_ht: awayScoreHt,
    p_qualifier: qualifier,
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
