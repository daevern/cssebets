import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Cron target (every 2 min): settles finished UFC fights. Kept separate from
// the odds refresh so payouts never queue behind feed-quota budgeting.
export const Route = createFileRoute("/api/public/hooks/ufc-settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const { runUfcAutoSettle } = await import("@/lib/ufc-odds.server");
          const settle = await runUfcAutoSettle();
          return new Response(JSON.stringify({ settle }), {
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
