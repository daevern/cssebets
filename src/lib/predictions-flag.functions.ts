// User-facing: flag a settled bet for admin review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const flagPredictionForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      predictionId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Uses the user-scoped supabase client so auth.uid() is set inside the RPC.
    const { error } = await context.supabase.rpc("flag_prediction_for_review", {
      p_prediction_id: data.predictionId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
