// Catch-up settlement for finished matches that still have pending predictions.
// Triggered from the PICKS page so users see settled bets + wallet payouts
// without waiting for an admin sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const settleFinishedPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find finished matches with at least one pending prediction.
    const { data: pendingRows, error } = await supabaseAdmin
      .from("predictions")
      .select("match_id, matches!inner(id, status, home_score, away_score, home_score_ht, away_score_ht)")
      .eq("status", "pending")
      .eq("matches.status", "finished")
      .not("match_id", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const targets: Array<{ id: string; h: number; a: number; hh: number | null; ah: number | null }> = [];
    for (const r of (pendingRows ?? []) as any[]) {
      const m = r.matches;
      if (!m || seen.has(m.id)) continue;
      if (m.home_score == null || m.away_score == null) continue;
      seen.add(m.id);
      targets.push({ id: m.id, h: m.home_score, a: m.away_score, hh: m.home_score_ht, ah: m.away_score_ht });
    }

    let settled = 0;
    for (const t of targets) {
      const { data, error: e } = await (supabaseAdmin as any).rpc("settle_match_all_markets_atomic", {
        p_match_id: t.id, p_home: t.h, p_away: t.a, p_home_ht: t.hh, p_away_ht: t.ah,
      });
      if (!e) settled += (data as number) ?? 0;
    }
    return { matches: targets.length, settled };
  });
