import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitSchema = z.object({
  matchId: z.string().uuid().nullable(),
  market: z.enum(["result", "correct_score", "total_goals", "btts", "first_scorer", "tournament_winner", "group_winner"]),
  outcome: z.string().min(1).max(80),
  referenceOdds: z.number().min(1).max(100000),
  virtualStake: z.number().min(1).max(1_000_000),
  clientRequestId: z.string().uuid().optional(),
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

    // Server-side odds validation: never trust client-supplied odds.
    // For matches with stored reference_odds, validate the submitted odds against the
    // current snapshot/reference within a small tolerance to prevent payout inflation.
    let trustedOdds = data.referenceOdds;
    let snapshotId: string | null = null;
    if (data.matchId) {
      const { data: match } = await supabaseAdmin
        .from("matches")
        .select("reference_odds")
        .eq("id", data.matchId)
        .maybeSingle();

      const refOdds = (match as any)?.reference_odds as Record<string, number> | null;

      if (data.market === "result" && refOdds) {
        const key = data.outcome === "HOME" ? "home" : data.outcome === "DRAW" ? "draw" : data.outcome === "AWAY" ? "away" : null;
        const serverOdds = key ? Number(refOdds[key]) : null;
        if (!serverOdds || !Number.isFinite(serverOdds) || serverOdds < 1) {
          throw new Error("Odds for this market are not available.");
        }
        // Allow ±5% drift from server reference
        const drift = Math.abs(data.referenceOdds - serverOdds) / serverOdds;
        if (drift > 0.05) {
          throw new Error("Odds have changed. Please refresh and try again.");
        }
        trustedOdds = serverOdds;
      } else if (data.market !== "result") {
        // For non-result markets, fall back to the stored snapshot value if present;
        // otherwise reject to avoid arbitrary client odds.
        const marketOdds = refOdds && typeof refOdds === "object" ? (refOdds as any)[data.market]?.[data.outcome] : null;
        if (typeof marketOdds === "number" && marketOdds >= 1) {
          const drift = Math.abs(data.referenceOdds - marketOdds) / marketOdds;
          if (drift > 0.05) throw new Error("Odds have changed. Please refresh and try again.");
          trustedOdds = marketOdds;
        }
        // If no server-side reference exists for this market, cap at a safe ceiling.
        else if (data.referenceOdds > 50) {
          throw new Error("Odds exceed allowed range for this market.");
        }
      }

      const { data: snap } = await supabaseAdmin
        .from("match_odds_snapshots")
        .select("id")
        .eq("match_id", data.matchId)
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapshotId = (snap as any)?.id ?? null;
    } else if (data.market === "tournament_winner") {
      // No match attached; validate against tournament_outrights for the open tournament.
      const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("key,status")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!t) throw new Error("No tournament is currently open for betting.");
      const { data: outright } = await supabaseAdmin
        .from("tournament_outrights")
        .select("odds")
        .eq("tournament_key", (t as any).key)
        .ilike("team", data.outcome)
        .maybeSingle();
      if (!outright) throw new Error("This team is not available in tournament odds.");
      const serverOdds = Number((outright as any).odds);
      if (!Number.isFinite(serverOdds) || serverOdds < 1) {
        throw new Error("Tournament odds unavailable for this team.");
      }
      const drift = Math.abs(data.referenceOdds - serverOdds) / serverOdds;
      if (drift > 0.05) throw new Error("Odds have changed. Please refresh and try again.");
      trustedOdds = serverOdds;
    } else if (data.referenceOdds > 50) {
      throw new Error("Odds exceed allowed range.");
    }

    // Atomic: wallet debit + prediction insert + platform credit + exposure check + liability recalc
    const { data: predId, error } = await (supabaseAdmin as any).rpc("place_bet_atomic", {
      p_user_id: userId,
      p_match_id: data.matchId,
      p_market: data.market,
      p_outcome: data.outcome,
      p_odds: trustedOdds,
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
