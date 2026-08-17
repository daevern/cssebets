import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Hourly reconciliation hook. Called by pg_cron. Writes an audit_log entry
// whenever drift is detected so admins are alerted via the audit dashboard.
// Also sweeps finished matches with pending cards/corners bets, attempting a
// stats resync and letting the DB settler auto-void stale rows.
export const Route = createFileRoute("/api/public/hooks/reconciliation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { captureServerException } = await import("@/lib/sentry.report.server");
        const { data: report, error } = await supabaseAdmin.rpc("run_reconciliation_check");
        if (error) {
          captureServerException(error, { area: "reconciliation_hook" });
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        const r = report as {
          overall_status?: string;
          drift_check_count?: number;
        } | null;
        if (r?.overall_status === "DRIFT") {
          await supabaseAdmin.from("audit_log").insert({
            action: "reconciliation.drift_detected",
            entity: "system",
            metadata: report,
            reason: `Drift in ${r.drift_check_count} check(s)`,
          });
        }

        // Phase B — sports journal vs legacy bankroll reconciliation. Runs for
        // both worlds and raises an operational alert on any drift.
        const sportsReconciliation: Record<string, unknown> = {};
        for (const env of ["PRODUCTION", "SIMULATION"] as const) {
          const { data: rec, error: recErr } = await supabaseAdmin.rpc(
            "sports_journal_reconciliation",
            { p_env: env },
          );
          sportsReconciliation[env] = recErr ? { error: recErr.message } : rec;
          const recOk =
            !!rec &&
            typeof rec === "object" &&
            !Array.isArray(rec) &&
            (rec as { ok?: boolean }).ok === true;
          const drift = Boolean(recErr) || !recOk;
          if (drift) {
            captureServerException(recErr ?? new Error(`sports_journal_reconciliation drift ${env}`), {
              area: "reconciliation_hook",
              tags: { environment: env },
            });
            await supabaseAdmin.from("operational_alerts").insert({
              level: "critical",
              category: "accounting",
              title: "Sports journal reconciliation drift",
              message: `Sports accounting reconciliation failed for ${env}`,
              status: "open",
              metadata: recErr
                ? { error: recErr.message, environment: env }
                : (rec as import("@/integrations/supabase/types").Json),
            });
          }
        }

        // Cards/corners sweep — find finished matches with pending C/C bets,
        // resync stats from provider, then run the settler (which auto-voids
        // when stale beyond the configured window).
        let sweptMatches = 0;
        let sweptSettled = 0;
        try {
          const { data: rows } = await (supabaseAdmin as any)
            .from("predictions")
            .select("match_id, matches!inner(id, status, finished_at)")
            .eq("status", "pending")
            .eq("matches.status", "finished")
            .in("market", [
              "cards_over_under_2_5","cards_over_under_3_5","cards_over_under_4_5","cards_over_under_5_5",
              "home_cards_over_under_1_5","away_cards_over_under_1_5","red_card_match","first_card",
              "corners_over_under_8_5","corners_over_under_9_5","corners_over_under_10_5","corners_over_under_11_5",
              "home_corners_over_under_4_5","away_corners_over_under_4_5","first_corner",
            ] as any)
            .limit(200);
          const ids = Array.from(new Set(((rows ?? []) as any[]).map((x) => x.matches?.id).filter(Boolean)));
          for (const id of ids) {
            sweptMatches++;
            try {
              const { syncStats } = await import("@/lib/apifootball-analytics.server");
              await syncStats(id);
              const { data: stats } = await (supabaseAdmin as any)
                .from("match_stats").select("side, corners, yellow_cards, red_cards").eq("match_id", id);
              const patch: Record<string, number> = {};
              for (const s of (stats ?? []) as any[]) {
                const cards = (s.yellow_cards ?? 0) + (s.red_cards ?? 0);
                if (s.side === "home") {
                  if (s.corners != null) patch.home_corners = s.corners;
                  if (s.yellow_cards != null || s.red_cards != null) patch.home_cards = cards;
                } else if (s.side === "away") {
                  if (s.corners != null) patch.away_corners = s.corners;
                  if (s.yellow_cards != null || s.red_cards != null) patch.away_cards = cards;
                }
              }
              if (Object.keys(patch).length) {
                await (supabaseAdmin as any).from("matches").update(patch).eq("id", id);
              }
            } catch { /* ignore, still run settler for auto-void safety net */ }
            const { data: settled } = await (supabaseAdmin as any).rpc(
              "settle_cards_corners_for_match", { p_match_id: id },
            );
            sweptSettled += (settled as number) ?? 0;
          }
        } catch (e) {
          console.log("[reconciliation] cards/corners sweep failed", e);
        }

        return new Response(JSON.stringify({
          ok: true, report: r, cards_corners: { sweptMatches, sweptSettled },
          sports_reconciliation: sportsReconciliation,
        }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
