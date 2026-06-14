import { createFileRoute } from "@tanstack/react-router";

// Operational health checks. Scheduled via pg_cron every 5 minutes
// (job: health-check-5min). Persists each run into health_check_runs
// and raises operational_alerts for any failed/degraded check (deduped
// against existing open alerts with the same title).
export const Route = createFileRoute("/api/public/hooks/health-check")({
  server: {
    handlers: {
      POST: async () => {
        const { runHealthChecks } = await import("@/lib/health-checks.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const result = await runHealthChecks();

        // Raise alerts for non-ok checks.
        for (const c of result.checks) {
          if (c.status === "ok") continue;
          const level = c.status === "failed" ? "critical" : "warning";
          const title = `Health check ${c.status}: ${c.name}`;
          const { data: existing } = await supabaseAdmin
            .from("operational_alerts")
            .select("id").eq("status", "open").eq("title", title).limit(1);
          if (existing && existing.length) continue;
          await supabaseAdmin.from("operational_alerts").insert({
            level,
            category: "health_check",
            title,
            message: c.error
              ? `Check '${c.name}' ${c.status}: ${c.error}`
              : `Check '${c.name}' reported ${c.status}.`,
            metadata: { check: c.name, status: c.status, duration_ms: c.duration_ms, metadata: c.metadata ?? null },
          });
        }

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
