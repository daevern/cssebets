import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Cron target (every 5 min): refreshes odds for all upcoming UFC cards. The
// sync itself budgets feed calls per event based on how soon each card starts.
export const Route = createFileRoute("/api/public/hooks/ufc-odds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const maxParam = Number(url.searchParams.get("maxEvents") ?? "");
          const { runUfcOddsSync } = await import("@/lib/ufc-odds.server");
          const odds = await runUfcOddsSync({
            force,
            ...(Number.isFinite(maxParam) && maxParam > 0 ? { maxEvents: maxParam } : {}),
          });
          return new Response(JSON.stringify({ odds }), {
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
