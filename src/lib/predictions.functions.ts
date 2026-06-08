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

    const { data: inserted, error } = await supabase
      .from("predictions")
      .insert({
        user_id: userId,
        match_id: data.matchId,
        market: data.market,
        outcome: data.outcome,
        reference_odds: data.referenceOdds,
        virtual_stake: data.virtualStake,
        potential_return: potentialReturn,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Audit log
    await supabase.from("audit_log").insert({
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
