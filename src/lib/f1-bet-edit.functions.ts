import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireApprovedMember } from "@/lib/access-control";

const EditSchema = z.object({
  betId: z.string().uuid(),
  newStake: z.number().min(10).max(50000),
});

const CancelSchema = z.object({ betId: z.string().uuid() });

function friendly(msg: string): string {
  if (!msg) return "Could not update bet.";
  if (msg.includes("INSUFFICIENT_BALANCE")) return "Insufficient points balance to increase this bet.";
  if (msg.includes("MATCH_LOCKED")) return "This event is locked — the bet can no longer be changed.";
  if (msg.includes("BET_NOT_PENDING")) return "This bet has already been settled.";
  if (msg.includes("INVALID_STAKE")) return "Stake must be between 10 and 50,000 points.";
  if (msg.includes("MAX_PAYOUT_EXCEEDED")) return "Potential payout exceeds the per-bet maximum.";
  if (msg.includes("forbidden")) return "You can only edit your own bets.";
  return msg;
}

async function callRpc(fn: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc(fn, args);
  if (error) throw new Error(friendly(error.message ?? ""));
  return data;
}

export const editPendingF1RaceBetStake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EditSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const result = await callRpc("edit_f1_race_bet_stake", {
      p_user_id: context.userId,
      p_bet_id: data.betId,
      p_new_stake: data.newStake,
    });
    return { newStake: Number(result) };
  });

export const cancelPendingF1RaceBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CancelSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const result = await callRpc("cancel_f1_race_bet", {
      p_user_id: context.userId,
      p_bet_id: data.betId,
    });
    return { id: result };
  });

export const editPendingF1ChampBetStake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EditSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const result = await callRpc("edit_f1_championship_bet_stake", {
      p_user_id: context.userId,
      p_bet_id: data.betId,
      p_new_stake: data.newStake,
    });
    return { newStake: Number(result) };
  });

export const cancelPendingF1ChampBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CancelSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireApprovedMember(context);
    const result = await callRpc("cancel_f1_championship_bet", {
      p_user_id: context.userId,
      p_bet_id: data.betId,
    });
    return { id: result };
  });
