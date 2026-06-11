import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitSchema = z.object({
  matchId: z.string().uuid().nullable(),
  market: z.enum(["result", "correct_score", "total_goals", "btts", "first_scorer", "tournament_winner", "group_winner"]),
  outcome: z.string().min(1).max(80),
  referenceOdds: z.number().min(1).max(1000),
  virtualStake: z.number().min(1).max(1_000_000),
});

export const submitPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate the user is approved
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isMember = (roles ?? []).some((r) => r.role === "member" || r.role === "admin");
    if (!isMember) throw new Error("Your account isn't approved yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Latest odds snapshot to permanently link to
    let snapshotId: string | null = null;
    if (data.matchId) {
      const { data: snap } = await supabaseAdmin
        .from("match_odds_snapshots")
        .select("id")
        .eq("match_id", data.matchId)
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapshotId = (snap as any)?.id ?? null;
    }

    // Atomic: wallet debit + prediction insert + platform credit + exposure check + liability recalc
    const { data: predId, error } = await (supabaseAdmin as any).rpc("place_bet_atomic", {
      p_user_id: userId,
      p_match_id: data.matchId,
      p_market: data.market,
      p_outcome: data.outcome,
      p_odds: data.referenceOdds,
      p_stake: data.virtualStake,
      p_snapshot_id: snapshotId,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("INSUFFICIENT_BALANCE")) throw new Error("Insufficient points balance. Request more points to place this bet.");
      if (msg.includes("MAX_EXPOSURE_REACHED")) throw new Error("The platform does not currently have enough virtual bankroll to safely accept this prediction.");
      if (msg.includes("MATCH_LOCKED")) throw new Error("This match has already kicked off. Predictions are locked.");
      throw new Error(msg || "Could not place bet.");
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "prediction.submit",
      entity: "prediction",
      entity_id: predId as any,
      metadata: {
        market: data.market,
        outcome: data.outcome,
        stake: data.virtualStake,
        odds: data.referenceOdds,
      },
    });

    return { id: predId };
  });
