import { createFileRoute } from "@tanstack/react-router";

// Cron hook: pull real bookmaker odds for upcoming matches from API-Football.
// Budgeted to stay safely under the 100-req/day free tier.
//
// Defaults: 10 matches per run, refresh anything older than 6h within next 48h.
// Suggested cron: every 30 min during tournament; the function self-skips
// fresh matches and bails out cleanly on quota exhaustion.
export const Route = createFileRoute("/api/public/hooks/apifootball-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const max = Number(url.searchParams.get("max") ?? 10);
          const hoursAhead = Number(url.searchParams.get("hours") ?? 48);
          const freshness = Number(url.searchParams.get("freshness") ?? 6);

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
