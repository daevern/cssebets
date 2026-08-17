import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/f1-settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const { runF1AutoSettle } = await import("@/features/f1/services/f1Settlement.server");
          const r = await runF1AutoSettle();
          return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
        } catch (e) {
          const { captureServerException } = await import("@/lib/sentry.report.server");
          captureServerException(e, { area: "f1_settle_hook" });
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
