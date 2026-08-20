import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

/**
 * Guest (demo account) retention job.
 *
 * Every fresh visitor gets an anonymous Supabase session so the demo works.
 * Those accounts are disposable: this endpoint deletes anonymous accounts that
 * were created more than `hours` ago (default 48h). Deleting the auth user
 * cascades to the guest's profile, wallet, wallet transactions and demo bets,
 * so no demo data accumulates and the admin Users list stays real-members-only.
 *
 * Real (email/phone) accounts are never touched.
 */
export const Route = createFileRoute("/api/public/hooks/purge-guests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronAuth(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const hours = Math.min(
            720,
            Math.max(1, Number(url.searchParams.get("hours") ?? 48) || 48),
          );
          const limit = Math.min(
            500,
            Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200),
          );
          const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: guests, error } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("auth_provider", "anonymous")
            .lt("created_at", cutoff)
            .limit(limit);
          if (error) {
            return json({ ok: false, error: error.message }, 500);
          }

          let deleted = 0;
          const failures: string[] = [];
          for (const g of guests ?? []) {
            const id = (g as any).id as string;
            // Non-cascading demo rows first, so nothing is orphaned.
            for (const table of [
              "arcade_mini_rounds",
              "arcade_rps_rounds",
              "event_comments",
            ]) {
              await (supabaseAdmin as any).from(table).delete().eq("user_id", id);
            }
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (delErr) failures.push(delErr.message);
            else deleted += 1;
          }

          return json({
            ok: true,
            candidates: guests?.length ?? 0,
            deleted,
            failed: failures.length,
            firstError: failures[0] ?? null,
            cutoff,
          });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
