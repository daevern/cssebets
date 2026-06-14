import { createFileRoute } from "@tanstack/react-router";

// Operational health checks. Endpoint exists but is NOT yet scheduled.
// To enable: schedule via pg_cron to POST here every 5 minutes.
export const Route = createFileRoute("/api/public/hooks/health-check")({
  server: {
    handlers: {
      POST: async () => {
        const { runHealthChecks } = await import("@/lib/health-checks.server");
        const result = await runHealthChecks();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
