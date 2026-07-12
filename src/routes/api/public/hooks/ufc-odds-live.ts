import { createFileRoute } from "@tanstack/react-router";

// Cron target: fires every 30s during event windows. runUfcOddsSync early-exits
// cheaply when outside the ±12h event window, so cost off fight-night is ~zero.
// After the odds pass we run runUfcAutoSettle which flips moneyline/three_way
// bets from PENDING → WON/LOST as soon as the MMA feed reports a finished
// fight. Method/round bets stay open for admin to finalise.
export const Route = createFileRoute("/api/public/hooks/ufc-odds-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runUfcOddsSync, runUfcAutoSettle } = await import("@/lib/ufc-odds.server");
          const odds = await runUfcOddsSync();
          const settle = await runUfcAutoSettle();
          return new Response(JSON.stringify({ odds, settle }), {
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
