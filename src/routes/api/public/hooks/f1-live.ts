import { createFileRoute } from "@tanstack/react-router";

// Warms the live-state cache for any F1 race that has already started but not
// finished. Called by pg_cron every minute during race weekends; safe to call
// idempotently (each race is refreshed at most once per invocation).
export const Route = createFileRoute("/api/public/hooks/f1-live")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const nowIso = new Date().toISOString();
          const cutoffIso = new Date(Date.now() - 4 * 3600_000).toISOString();
          const { data: races } = await (supabaseAdmin as any)
            .from("f1_races")
            .select("id, status, starts_at")
            .lte("starts_at", nowIso)
            .gte("starts_at", cutoffIso)
            .in("status", ["scheduled", "in_progress"]);

          // Flip scheduled → in_progress once the race has started.
          const toLive = (races ?? []).filter((r: any) => r.status === "scheduled");
          if (toLive.length) {
            await (supabaseAdmin as any)
              .from("f1_races")
              .update({ status: "in_progress", updated_at: nowIso })
              .in("id", toLive.map((r: any) => r.id));
          }

          // Ensure any lingering open markets are suspended.
          await (supabaseAdmin as any).rpc("close_started_f1_race_markets");

          // Refresh live state cache for active races.
          const { refreshF1LiveRaceState } = await import("@/features/f1/services/f1LiveState.server");
          let refreshed = 0;
          for (const r of races ?? []) {
            try {
              const res = await refreshF1LiveRaceState(r.id);
              if (res) refreshed++;
            } catch {
              // best-effort per race
            }
          }
          return new Response(JSON.stringify({ ok: true, races: races?.length ?? 0, refreshed }), {
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
