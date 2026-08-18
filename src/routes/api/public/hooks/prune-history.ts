import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

/**
 * Manual / optional trigger for ops history prune.
 * Primary schedule is pg_cron → public.prune_ops_history(8000) every 10 minutes.
 */
export const Route = createFileRoute("/api/public/hooks/prune-history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const batch = Math.min(
            25000,
            Math.max(100, Number(url.searchParams.get("batch") ?? 8000) || 8000),
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await (supabaseAdmin as any).rpc("prune_ops_history", {
            p_batch_size: batch,
          });
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify(data ?? { ok: true }), {
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
