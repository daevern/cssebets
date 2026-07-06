import { createFileRoute } from "@tanstack/react-router";

// Cron: pull post-match player ratings + final stats for recently finished matches,
// and auto-regrade any cards/corners over-under bets whose result changes when
// API-Football revises the stats.
//
// - Matches finished in the last 60 minutes without ratings: full sync (ratings + stats + events).
// - Matches finished in the last 12 hours: refresh stats + events, then re-grade cards/corners.
//   API-Football commonly revises corner and shot totals for a few hours after full time.
// Also supports ?matchId=<uuid> for a one-off manual refresh.
async function regradeCardsCorners(
  supabaseAdmin: any,
  matchId: string,
): Promise<{ prediction_id: string; old_status: string; new_status: string; delta: number }[]> {
  const { data, error } = await supabaseAdmin.rpc("regrade_cards_corners_for_match", {
    p_match_id: matchId,
  });
  if (error) {
    console.error("[apifootball-fulltime] regrade failed", matchId, error);
    return [];
  }
  return (data as any[]) ?? [];
}

export const Route = createFileRoute("/api/public/hooks/apifootball-fulltime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncPlayerRatings, syncStats, syncEvents } = await import("@/lib/apifootball-analytics.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");

          const url = new URL(request.url);
          const manualId = url.searchParams.get("matchId");

          const results: any[] = [];

          if (manualId) {
            const r = await syncPlayerRatings(manualId);
            const s = await syncStats(manualId);
            const e = await syncEvents(manualId);
            const regraded = await regradeCardsCorners(supabaseAdmin, manualId);
            results.push({ matchId: manualId, ratings: r, stats: s, events: e, regraded });
          } else {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

            // Matches finished recently — refresh stats + events (API revises them).
            const { data: recent } = await (supabaseAdmin as any)
              .from("matches")
              .select("id, updated_at")
              .eq("status", "finished")
              .gt("updated_at", twelveHoursAgo);

            for (const m of recent ?? []) {
              const id = (m as any).id;
              const entry: any = { matchId: id };
              // Ratings only fetched once (fresh matches, no ratings yet).
              if ((m as any).updated_at > oneHourAgo) {
                const { count } = await (supabaseAdmin as any)
                  .from("match_player_ratings")
                  .select("id", { count: "exact", head: true })
                  .eq("match_id", id);
                if ((count ?? 0) === 0) {
                  entry.ratings = await syncPlayerRatings(id);
                }
              }
              // Always refresh stats + events for anything finished in last 12h,
              // then re-grade cards/corners in case totals moved.
              await syncStats(id);
              await syncEvents(id);
              const regraded = await regradeCardsCorners(supabaseAdmin, id);
              if (regraded.length > 0) entry.regraded = regraded;
              if (Object.keys(entry).length > 1) results.push(entry);
            }
          }

          return new Response(JSON.stringify({ ok: true, processed: results.length, quota: await getQuotaStatus(), results }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
