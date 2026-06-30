import { createFileRoute } from "@tanstack/react-router";

// Cron: pull post-match player ratings + final stats for matches that ended
// in the last 60 minutes and don't yet have ratings cached.
export const Route = createFileRoute("/api/public/hooks/apifootball-fulltime")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncPlayerRatings, syncStats, syncEvents } = await import("@/lib/apifootball-analytics.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");

          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: matches } = await (supabaseAdmin as any)
            .from("matches")
            .select("id")
            .eq("status", "finished")
            .gt("updated_at", oneHourAgo);

          const results: any[] = [];
          for (const m of matches ?? []) {
            const id = (m as any).id;
            // skip if ratings already exist
            const { count } = await (supabaseAdmin as any)
              .from("match_player_ratings")
              .select("id", { count: "exact", head: true })
              .eq("match_id", id);
            if ((count ?? 0) > 0) continue;
            const r = await syncPlayerRatings(id);
            await syncStats(id);
            await syncEvents(id);
            results.push({ matchId: id, ...r });
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
