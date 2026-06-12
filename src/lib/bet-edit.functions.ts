import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EditSchema = z.object({
  predictionId: z.string().uuid(),
  newStake: z.number().min(10).max(50000),
});

const CancelSchema = z.object({
  predictionId: z.string().uuid(),
});

function friendly(msg: string): string {
  if (!msg) return "Could not update bet.";
  if (msg.includes("INSUFFICIENT_BALANCE")) return "Insufficient points balance to increase this bet.";
  if (msg.includes("MATCH_LOCKED")) return "Match has already kicked off — this bet can no longer be changed.";
  if (msg.includes("BET_NOT_PENDING")) return "This bet has already been settled.";
  if (msg.includes("INVALID_STAKE")) return "Stake must be between 10 and 50,000 points.";
  if (msg.includes("MAX_PAYOUT_EXCEEDED")) return "Potential payout exceeds the per-bet maximum.";
  if (msg.includes("forbidden")) return "You can only edit your own bets.";
  return msg;
}

export const editPendingBetStake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EditSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("edit_pending_bet_stake", {
      p_user_id: context.userId,
      p_prediction_id: data.predictionId,
      p_new_stake: data.newStake,
    });
    if (error) throw new Error(friendly(error.message ?? ""));
    return { newStake: Number(result) };
  });

export const cancelPendingBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("cancel_pending_bet", {
      p_user_id: context.userId,
      p_prediction_id: data.predictionId,
    });
    if (error) throw new Error(friendly(error.message ?? ""));
    return { id: result };
  });
