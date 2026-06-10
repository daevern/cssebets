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

    // Validate kickoff lock
    if (data.matchId) {
      const { data: match, error: mErr } = await supabase
        .from("matches")
        .select("id, kickoff_at, status")
        .eq("id", data.matchId)
        .single();
      if (mErr || !match) throw new Error("Match not found");
      if (new Date(match.kickoff_at).getTime() <= Date.now() || match.status !== "scheduled") {
        throw new Error("This match has already kicked off. Predictions are locked.");
      }
    }

    const potentialReturn = Number((data.virtualStake * data.referenceOdds).toFixed(2));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find latest odds snapshot for the match (if any) to permanently link this bet to
    // the exact odds we showed the user.
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

    // Create the prediction first so we have a stable reference_id for the debit txn
    const { data: inserted, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        user_id: userId,
        match_id: data.matchId,
        market: data.market,
        outcome: data.outcome,
        reference_odds: data.referenceOdds,
        reference_odds_snapshot_id: snapshotId,
        virtual_stake: data.virtualStake,
        potential_return: potentialReturn,
      } as any)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Atomically debit the wallet. If insufficient balance, roll back the prediction.
    const { error: walletErr } = await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: userId,
      p_type: "debit",
      p_amount: data.virtualStake,
      p_reference_type: "bet_placement",
      p_reference_id: inserted.id,
      p_note: `Bet placed: ${data.market} ${data.outcome}`,
    });
    if (walletErr) {
      await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
      if (walletErr.message?.includes("INSUFFICIENT_BALANCE")) {
        throw new Error("Insufficient points balance. Request more points to place this bet.");
      }
      throw new Error(walletErr.message);
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "prediction.submit",
      entity: "prediction",
      entity_id: inserted.id,
      metadata: {
        market: data.market,
        outcome: data.outcome,
        stake: data.virtualStake,
        odds: data.referenceOdds,
      },
    });

    return { id: inserted.id };
  });
