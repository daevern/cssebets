// Catch-up settlement for finished matches that still have pending predictions.
// Triggered from the PICKS page so users see settled bets + wallet payouts
// without waiting for an admin sync.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin only");
}

// Mirror totals from match_stats rows onto matches.home_/away_ corners/cards
// so the settlement function's freshness check passes. Safe to call repeatedly
// — only fills columns that are still NULL.
async function mirrorStatsOntoMatch(supabaseAdmin: any, matchId: string) {
  const { data: rows } = await supabaseAdmin
    .from("match_stats")
    .select("side, corners, yellow_cards, red_cards")
    .eq("match_id", matchId);
  if (!rows?.length) return;
  const patch: Record<string, number> = {};
  for (const r of rows as any[]) {
    const cards = (r.yellow_cards ?? 0) + (r.red_cards ?? 0);
    if (r.side === "home") {
      if (r.corners != null) patch.home_corners = r.corners;
      if (r.yellow_cards != null || r.red_cards != null) patch.home_cards = cards;
    } else if (r.side === "away") {
      if (r.corners != null) patch.away_corners = r.corners;
      if (r.yellow_cards != null || r.red_cards != null) patch.away_cards = cards;
    }
  }
  if (!Object.keys(patch).length) return;
  await supabaseAdmin.from("matches").update(patch).eq("id", matchId);
}

export const settleFinishedPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find finished matches with at least one pending prediction.
    const { data: pendingRows, error } = await supabaseAdmin
      .from("predictions")
      .select("match_id, market, matches!inner(id, status, home_score, away_score, home_score_ht, away_score_ht, home_corners, away_corners, home_cards, away_cards, finished_at)")
      .eq("status", "pending")
      .eq("matches.status", "finished")
      .not("match_id", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const targets: Array<{
      id: string; h: number; a: number; hh: number | null; ah: number | null;
      needsStats: boolean;
    }> = [];
    for (const r of (pendingRows ?? []) as any[]) {
      const m = r.matches;
      if (!m || seen.has(m.id)) continue;
      if (m.home_score == null || m.away_score == null) continue;
      seen.add(m.id);
      const market = String(r.market ?? "");
      const isCC = market.includes("cards") || market.includes("corners") || market === "red_card_match" || market === "first_card" || market === "first_corner";
      const statsMissing = isCC && (
        m.home_corners == null || m.away_corners == null ||
        m.home_cards == null || m.away_cards == null
      );
      targets.push({
        id: m.id, h: m.home_score, a: m.away_score,
        hh: m.home_score_ht, ah: m.away_score_ht,
        needsStats: statsMissing,
      });
    }

    // Best-effort: attempt to pull missing stats from API-Football, then mirror
    // onto matches so the DB settler considers them fresh.
    for (const t of targets.filter((x) => x.needsStats)) {
      try {
        const { syncStats } = await import("./apifootball-analytics.server");
        await syncStats(t.id);
        await mirrorStatsOntoMatch(supabaseAdmin, t.id);
      } catch { /* rate-limited or fixture missing — auto-void safety net still applies */ }
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

// Admin action: force-resync stats from API-Football and immediately grade
// pending cards/corners bets. Use when a match has finished but stats never
// arrived and users are stuck in PENDING.
export const resyncStatsAndSettle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let statsOk = false;
    let statsReason: string | null = null;
    try {
      const { syncStats } = await import("./apifootball-analytics.server");
      const r = await syncStats(data.matchId);
      statsOk = Boolean((r as any)?.ok);
      if (!statsOk) statsReason = String((r as any)?.reason ?? "unknown");
    } catch (e) {
      statsReason = (e as Error).message;
    }
    await mirrorStatsOntoMatch(supabaseAdmin, data.matchId);
    const { data: settled, error } = await (supabaseAdmin as any).rpc(
      "settle_cards_corners_for_match",
      { p_match_id: data.matchId },
    );
    if (error) throw new Error(error.message);
    return { statsOk, statsReason, settled: (settled as number) ?? 0 };
  });

// Admin action: manually override the cards/corners totals when the provider
// has no stats. Grades bets against the entered numbers.
export const manualSettleCardsCorners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    matchId: z.string().uuid(),
    homeCorners: z.number().int().min(0).max(50).nullable(),
    awayCorners: z.number().int().min(0).max(50).nullable(),
    homeCards: z.number().int().min(0).max(30).nullable(),
    awayCards: z.number().int().min(0).max(30).nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, number> = {};
    if (data.homeCorners != null) patch.home_corners = data.homeCorners;
    if (data.awayCorners != null) patch.away_corners = data.awayCorners;
    if (data.homeCards != null) patch.home_cards = data.homeCards;
    if (data.awayCards != null) patch.away_cards = data.awayCards;
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabaseAdmin
        .from("matches").update(patch).eq("id", data.matchId);
      if (upErr) throw new Error(upErr.message);
    }
    const { data: settled, error } = await (supabaseAdmin as any).rpc(
      "settle_cards_corners_for_match",
      { p_match_id: data.matchId },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "cards_corners.manual_settle",
      entity: "match",
      entity_id: data.matchId,
      metadata: patch,
      reason: "Manual stats override",
    } as any);
    return { settled: (settled as number) ?? 0 };
  });
