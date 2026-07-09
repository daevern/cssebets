import { createFileRoute } from "@tanstack/react-router";

// Cron: fires ~every 15s (4 offset pg_cron jobs at :00/:15/:30/:45).
// Pulls live in-play 1X2 odds from API-Football with an Odds-API fallback,
// writes to match_odds_snapshots + reference_odds so the market movement
// graph reacts to goals within seconds.
//
// Early-exits cheaply when no fixtures are in play, so cost outside match
// windows is effectively zero.
export const Route = createFileRoute("/api/public/hooks/odds-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runLiveOddsSync } = await import("@/lib/odds-live.server");
          const result = await runLiveOddsSync();
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
