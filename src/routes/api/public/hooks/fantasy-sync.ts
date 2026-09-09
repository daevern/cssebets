import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Cron-invoked: keep the Fantasy XI player pool, gameweeks, scoring and prize
// settlement up to date from the football feed.
export const Route = createFileRoute("/api/public/hooks/fantasy-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const { runFantasySync } = await import("@/features/fantasy/fantasySync.server");
          const result = await runFantasySync();
          return new Response(JSON.stringify({ ok: true, ...result }), {
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
