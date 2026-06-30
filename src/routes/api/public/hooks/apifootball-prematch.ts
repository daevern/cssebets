import { createFileRoute } from "@tanstack/react-router";

// Cron: warm pre-match analytics (H2H + injuries) for scheduled matches in
// the next 48h. Cached per pair / per fixture so repeat calls are cheap.
export const Route = createFileRoute("/api/public/hooks/apifootball-prematch")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncH2H, syncInjuries } = await import("@/lib/apifootball-analytics.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");

          const horizon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          const { data: matches } = await (supabaseAdmin as any)
            .from("matches")
            .select("id")
            .eq("status", "scheduled")
            .gt("kickoff_at", new Date().toISOString())
            .lt("kickoff_at", horizon)
            .order("kickoff_at", { ascending: true })
            .limit(8);

          const results: any[] = [];
          for (const m of matches ?? []) {
            const id = (m as any).id;
            const h = await syncH2H(id);
            const inj = await syncInjuries(id);
            results.push({ matchId: id, h2h: h, injuries: inj });
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
