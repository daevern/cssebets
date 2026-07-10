import { createFileRoute } from "@tanstack/react-router";

// Cron target: fires every 30s during event windows. runUfcOddsSync early-exits
// cheaply when outside the ±12h event window, so cost off fight-night is ~zero.
export const Route = createFileRoute("/api/public/hooks/ufc-odds-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runUfcOddsSync } = await import("@/lib/ufc-odds.server");
          const result = await runUfcOddsSync();
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
