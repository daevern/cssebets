import { createFileRoute } from "@tanstack/react-router";

// Cron target: fires every 30s during event windows. Discovers upcoming UFC
// events, syncs odds, and settles finished fights. Settlement gets feed
// quota priority over odds refreshes so finished fights can pay out promptly.
export const Route = createFileRoute("/api/public/hooks/ufc-odds-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runUfcOddsSync, runUfcAutoSettle, runUfcEventDiscovery } = await import("@/lib/ufc-odds.server");
          const discovery = await runUfcEventDiscovery();
          const settle = await runUfcAutoSettle();
          const odds = settle.checked > 0
            ? { ok: true, skipped: "settlement check in progress" }
            : await runUfcOddsSync();
          return new Response(JSON.stringify({ discovery, odds, settle }), {
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
