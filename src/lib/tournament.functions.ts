import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin only");
}

// Public refresh: any authenticated user can trigger (throttled server-side).
export const refreshTournamentOdds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runTournamentOddsSync } = await import("@/lib/tournament-odds.server");
    return runTournamentOddsSync({});
  });

// Admin force-sync.
export const forceSyncTournamentOdds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runTournamentOddsSync } = await import("@/lib/tournament-odds.server");
    return runTournamentOddsSync({ force: true });
  });

const SettleSchema = z.object({
  tournamentKey: z.string().min(1),
  winnerTeam: z.string().min(1).max(80),
});

export const settleTournamentWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SettleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: known } = await supabaseAdmin
      .from("tournament_outrights")
      .select("team")
      .eq("tournament_key", data.tournamentKey)
      .ilike("team", data.winnerTeam)
      .maybeSingle();
    if (!known) throw new Error(`Team "${data.winnerTeam}" not found in tournament odds.`);

    const { data: settled, error } = await (supabaseAdmin as any).rpc(
      "settle_tournament_winner_atomic",
      { p_tournament_key: data.tournamentKey, p_winner_team: (known as any).team },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "tournament.settle",
      entity: "tournament",
      entity_id: null,
      metadata: { tournamentKey: data.tournamentKey, winner: (known as any).team, settled },
    });

    return { settled: settled as number };
  });

const LockSchema = z.object({
  tournamentKey: z.string().min(1),
  status: z.enum(["open", "locked"]),
});

export const setTournamentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LockSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tournaments")
      .update({ status: data.status } as any)
      .eq("key", data.tournamentKey)
      .neq("status", "settled");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
