import { createFileRoute } from "@tanstack/react-router";

// Cron hook: pull real bookmaker odds for upcoming matches from API-Football.
// Budgeted by the database quota guard in `apiFootballGet`.
//
// Defaults: refresh upcoming matches every few minutes. The function self-skips
// fresh matches and bails out cleanly on quota exhaustion.
export const Route = createFileRoute("/api/public/hooks/apifootball-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const suppliedKey = request.headers.get("apikey");
          if (expectedKey && suppliedKey !== expectedKey) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }

          const url = new URL(request.url);
          const max = Math.max(1, Math.min(20, Number(url.searchParams.get("max") ?? 8) || 8));
          const hoursAhead = Math.max(1, Math.min(72, Number(url.searchParams.get("hours") ?? 48) || 48));
          const freshness = Math.max(0.01, Math.min(24, Number(url.searchParams.get("freshness") ?? 0.08) || 0.08));

          const { syncUpcomingMatchOdds } = await import("@/lib/apifootball-sync.server");
          const { getQuotaStatus } = await import("@/lib/apifootball.server");
          const result = await syncUpcomingMatchOdds({
            maxMatches: max,
            hoursAhead,
            freshnessHours: freshness,
          });
          const quota = await getQuotaStatus();
          return new Response(JSON.stringify({ ok: true, quota, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
