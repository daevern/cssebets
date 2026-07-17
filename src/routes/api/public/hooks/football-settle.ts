import { createFileRoute } from "@tanstack/react-router";

// Dedicated settlement hook, kept separate from football-live so a failure
// in live-score fetch doesn't block settlement (and vice versa).
export const Route = createFileRoute("/api/public/hooks/football-settle")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { settleFinishedFootballEvents } = await import(
            "@/features/football/services/footballSettlement.server"
          );
          const settled = await settleFinishedFootballEvents({ max: 25 });
          return new Response(JSON.stringify({ ok: true, settled }), {
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
