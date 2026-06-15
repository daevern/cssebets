import { createFileRoute } from "@tanstack/react-router";

// Cron-invoked hook that syncs Football-Data fixtures and auto-settles
// any matches that just transitioned to FINISHED. Called by pg_cron.
export const Route = createFileRoute("/api/public/hooks/sync-fixtures")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runFootballDataSync } = await import("@/lib/sync.server");
          const result = await runFootballDataSync({ userId: null });
          return new Response(JSON.stringify({ ok: true, result }), {
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
