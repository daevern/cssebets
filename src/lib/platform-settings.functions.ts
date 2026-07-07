import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformSettings = {
  id: number;
  margin_pct: number;
  exposure_cap_pct: number;
  max_stake_per_bet: number;
  max_potential_payout: number;
  apply_margin_to_real: boolean;
  bets_paused: boolean;
  correct_score_disabled: boolean;
  high_odds_disabled: boolean;
  high_odds_threshold: number;
  disabled_markets: string[];
  max_bets_per_user_per_match: number;
  updated_at: string;
};

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_settings" as any)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as PlatformSettings | null;
  });

const UpdateSchema = z.object({
  marginPct: z.number().min(0).max(50),
  exposureCapPct: z.number().min(0.01).max(1),
  maxStakePerBet: z.number().min(0).max(10_000_000),
  maxPotentialPayout: z.number().min(0).max(100_000_000),
  applyMarginToReal: z.boolean(),
  betsPaused: z.boolean().optional(),
  correctScoreDisabled: z.boolean().optional(),
  highOddsDisabled: z.boolean().optional(),
  highOddsThreshold: z.number().min(1).max(1_000_000).optional(),
  disabledMarkets: z.array(z.string().max(40)).max(20).optional(),
  maxBetsPerUserPerMatch: z.number().int().min(0).max(1000).optional(),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("update_platform_settings", {
      p_admin_id: userId,
      p_margin_pct: data.marginPct,
      p_exposure_cap_pct: data.exposureCapPct,
      p_max_stake_per_bet: data.maxStakePerBet,
      p_max_potential_payout: data.maxPotentialPayout,
      p_apply_margin_to_real: data.applyMarginToReal,
      p_bets_paused: data.betsPaused ?? null,
      p_correct_score_disabled: data.correctScoreDisabled ?? null,
      p_high_odds_disabled: data.highOddsDisabled ?? null,
      p_high_odds_threshold: data.highOddsThreshold ?? null,
      p_disabled_markets: data.disabledMarkets ?? null,
      p_max_bets_per_user_per_match: data.maxBetsPerUserPerMatch ?? null,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "platform_settings.update",
      entity: "platform_settings",
      entity_id: null,
      metadata: data as any,
    });
    return row as PlatformSettings;
  });
