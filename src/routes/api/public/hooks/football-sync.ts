import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Cron-invoked hook: sync fixtures for all enabled football competitions,
// then refresh odds for the closest matches. Called by pg_cron.
export const Route = createFileRoute("/api/public/hooks/football-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const { syncAllFootballFixtures, syncFootballOddsBatch } = await import(
            "@/features/football/services/footballSync.server"
          );
          const fixtures = await syncAllFootballFixtures();
          const odds = await syncFootballOddsBatch({ maxEvents: 25, freshnessMinutes: 10 });
          return new Response(JSON.stringify({ ok: true, fixtures, odds }), {
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
