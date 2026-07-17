import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/f1-odds")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncF1Odds } = await import("@/features/f1/services/f1Sync.server");
          const r = await syncF1Odds();
          return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
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
