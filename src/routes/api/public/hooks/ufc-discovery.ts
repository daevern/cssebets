import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Cron target (every 30 min): scans the feed for upcoming UFC cards and keeps
// every unfinished event live in the database. No manual scheduling needed.
export const Route = createFileRoute("/api/public/hooks/ufc-discovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const { runUfcEventDiscovery } = await import("@/lib/ufc-odds.server");
          const { runUfcOddsApiSync } = await import("@/lib/ufc-oddsapi.server");
          // The Odds API sees future cards even when the MMA stats feed's plan
          // window doesn't, so it drives discovery + pricing for upcoming events.
          const oddsapi = await runUfcOddsApiSync();
          const discovery = await runUfcEventDiscovery({ force });
          return new Response(JSON.stringify({ oddsapi, discovery }), {
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
