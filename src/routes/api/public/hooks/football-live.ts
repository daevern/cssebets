import { createFileRoute } from "@tanstack/react-router";

// Cron-invoked hook: refresh live scores + auto-settle any finished football events.
export const Route = createFileRoute("/api/public/hooks/football-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncFootballLiveScores } = await import(
            "@/features/football/services/footballSync.server"
          );
          const { settleFinishedFootballEvents } = await import(
            "@/features/football/services/footballSettlement.server"
          );
          const { suspendStaleFootballMarkets } = await import(
            "@/features/football/services/oddsFreshness.server"
          );
          const live = await syncFootballLiveScores();
          const freshness = await suspendStaleFootballMarkets();
          const settled = await settleFinishedFootballEvents({ max: 20 });
          return new Response(JSON.stringify({ ok: true, live, freshness, settled }), {
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
