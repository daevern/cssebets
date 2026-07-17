import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/f1-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncF1Races, syncF1DriversAndTeams } = await import("@/features/f1/services/f1Sync.server");
          const races = await syncF1Races();
          const drivers = await syncF1DriversAndTeams();
          return new Response(JSON.stringify({ races, drivers }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
