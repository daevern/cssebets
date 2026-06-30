import { createFileRoute } from "@tanstack/react-router";

// Cron: sync lineups for matches with kickoff in the next 90 min that don't
// yet have a lineup row. Cheap — one /fixtures/lineups call per matched fixture.
export const Route = createFileRoute("/api/public/hooks/apifootball-lineups")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncLineups } = await import("@/lib/apifootball-analytics.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");

          const horizon = new Date(Date.now() + 90 * 60 * 1000).toISOString();
          const { data: matches } = await (supabaseAdmin as any)
            .from("matches")
            .select("id, kickoff_at")
            .eq("status", "scheduled")
            .gt("kickoff_at", new Date().toISOString())
            .lt("kickoff_at", horizon);

          const results: any[] = [];
          for (const m of matches ?? []) {
            const r = await syncLineups((m as any).id);
            results.push({ matchId: (m as any).id, ...r });
            if ("reason" in r && r.reason?.includes("quota")) break;
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
