import { createFileRoute } from "@tanstack/react-router";

// Hourly reconciliation hook. Called by pg_cron. Writes an audit_log entry
// whenever drift is detected so admins are alerted via the audit dashboard.
export const Route = createFileRoute("/api/public/hooks/reconciliation")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: report, error } = await supabaseAdmin.rpc("run_reconciliation_check" as any);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        const r: any = report;
        if (r?.overall_status === "DRIFT") {
          await supabaseAdmin.from("audit_log").insert({
            action: "reconciliation.drift_detected",
            entity: "system",
            metadata: r,
            reason: `Drift in ${r.drift_check_count} check(s)`,
          });
        }
        return new Response(JSON.stringify({ ok: true, report: r }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
