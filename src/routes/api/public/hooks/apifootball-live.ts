import { createFileRoute } from "@tanstack/react-router";

// Cron: every minute. Polls live state (events + stats) for matches that are
// currently in play, then bails out cheaply if no live fixture exists.
export const Route = createFileRoute("/api/public/hooks/apifootball-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncEvents, syncStats, syncScore } = await import("@/lib/apifootball-analytics.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");

          const now = new Date();
          // A match is "live" if kickoff was in the last 3h and status not finished.
          const start = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
          const { data: matches } = await (supabaseAdmin as any)
            .from("matches")
            .select("id")
            .neq("status", "finished")
            .gt("kickoff_at", start)
            .lt("kickoff_at", now.toISOString());

          if (!matches?.length) {
            return new Response(JSON.stringify({ ok: true, skipped: "no live fixtures" }), {
              headers: { "content-type": "application/json" },
            });
          }

          const results: any[] = [];
          for (const m of matches) {
            const id = (m as any).id;
            const sc = await syncScore(id);
            const ev = await syncEvents(id);
            const st = await syncStats(id);
            results.push({ matchId: id, score: sc, events: ev, stats: st });
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
