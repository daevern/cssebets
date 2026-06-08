// Server-only helpers for settling predictions and crediting wallets.
// Imported lazily from server fn handlers via `await import(...)`.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function settlePredictionsForMatch(matchId: string, homeScore: number, awayScore: number) {
  const winner: "HOME" | "AWAY" | "DRAW" =
    homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW";

  const { data: preds } = await supabaseAdmin
    .from("predictions")
    .select("*")
    .eq("match_id", matchId)
    .eq("status", "pending");

  let settled = 0;
  for (const p of preds ?? []) {
    let won = false;
    let points = 0;
    if (p.market === "result") {
      won = p.outcome === winner;
      if (won) points = 3;
    } else if (p.market === "correct_score") {
      won = p.outcome === `${homeScore}-${awayScore}`;
      if (won) points = 5;
    } else if (p.market === "total_goals") {
      const m = /^(OVER|UNDER)_(\d+(\.\d+)?)$/.exec(p.outcome);
      if (m) {
        const total = homeScore + awayScore;
        const line = parseFloat(m[2]);
        won = m[1] === "OVER" ? total > line : total < line;
        if (won) points = 2;
      }
    } else if (p.market === "btts") {
      const both = homeScore > 0 && awayScore > 0;
      won = (p.outcome === "YES" && both) || (p.outcome === "NO" && !both);
      if (won) points = 2;
    }

    await supabaseAdmin
      .from("predictions")
      .update({
        status: won ? "won" : "lost",
        points,
        settled_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (won) {
      const payout = Number(p.potential_return ?? Number(p.virtual_stake) * Number(p.reference_odds));
      if (payout > 0) {
        await supabaseAdmin.rpc("wallet_apply_change", {
          p_user_id: p.user_id,
          p_type: "credit",
          p_amount: payout,
          p_reference_type: "bet_settlement",
          p_reference_id: p.id,
          p_note: `Win payout: ${p.market} ${p.outcome}`,
        });
      }
    }
    settled++;
  }
  return settled;
}
