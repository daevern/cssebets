import { createFileRoute } from "@tanstack/react-router";

// Cron: pull post-match player ratings + final stats for recently finished matches.
// - Matches finished in the last 60 minutes without ratings: full sync (ratings + stats + events).
// - Matches finished in the last 6 hours: refresh stats + events (API-Football often
//   revises corner / shot totals for up to a few hours post-match).
// Also supports ?matchId=<uuid> for a one-off manual refresh.
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
            results.push({ matchId: manualId, ratings: r, stats: s, events: e });
          } else {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

            // Matches finished recently — refresh stats + events (API revises them).
            const { data: recent } = await (supabaseAdmin as any)
              .from("matches")
              .select("id, updated_at")
              .eq("status", "finished")
              .gt("updated_at", sixHoursAgo);

            for (const m of recent ?? []) {
              const id = (m as any).id;
              // Ratings only fetched once (fresh matches, no ratings yet).
              if ((m as any).updated_at > oneHourAgo) {
                const { count } = await (supabaseAdmin as any)
                  .from("match_player_ratings")
                  .select("id", { count: "exact", head: true })
                  .eq("match_id", id);
                if ((count ?? 0) === 0) {
                  const r = await syncPlayerRatings(id);
                  results.push({ matchId: id, ratings: r });
                }
              }
              // Always refresh stats + events for anything finished in last 6h.
              await syncStats(id);
              await syncEvents(id);
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
