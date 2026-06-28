import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

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

    try {
      await enforceRateLimit(`user:${userId}`, "bet_placement");
    } catch (e) {
      if ((e as Error).message === "RATE_LIMITED") throw new Error("Too many requests. Please try again later.");
      throw e;
    }

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

      const refOdds = (match as any)?.reference_odds as Record<string, any> | null;
      if (!refOdds) throw new Error("Odds for this market are not available.");

      if (data.market === "result") {
        const key = data.outcome === "HOME" ? "home" : data.outcome === "DRAW" ? "draw" : data.outcome === "AWAY" ? "away" : null;
        const serverOdds = key ? Number(refOdds[key]) : null;
        if (!serverOdds || !Number.isFinite(serverOdds) || serverOdds < 1) {
          throw new Error("Odds for this market are not available.");
        }
        const drift = Math.abs(data.referenceOdds - serverOdds) / serverOdds;
        if (drift > 0.05) throw new Error("Odds have changed. Please refresh and try again.");
        trustedOdds = serverOdds;
      } else {
        const marketOdds = typeof refOdds === "object" ? (refOdds as any)[data.market]?.[data.outcome] : null;
        if (typeof marketOdds !== "number" || !Number.isFinite(marketOdds) || marketOdds < 1) {
          throw new Error("Odds for this market are not available.");
        }
        const drift = Math.abs(data.referenceOdds - marketOdds) / marketOdds;
        if (drift > 0.05) throw new Error("Odds have changed. Please refresh and try again.");
        trustedOdds = marketOdds;
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
    } else {
      throw new Error("Odds for this market are not available.");
    }

    // Atomic: wallet debit + prediction insert + platform credit + exposure check + liability recalc.
    // p_client_request_id provides idempotency: a duplicate submission with the same key returns the
    // existing prediction id instead of creating/charging a second bet.
    const { data: predId, error } = await (supabaseAdmin as any).rpc("place_bet_atomic", {
      p_user_id: userId,
      p_match_id: data.matchId,
      p_market: data.market,
      p_outcome: data.outcome,
      p_odds: trustedOdds,
      p_stake: data.virtualStake,
      p_snapshot_id: snapshotId,
      p_client_request_id: data.clientRequestId ?? null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("BETTING_PAUSED")) throw new Error("Bet placement is temporarily paused.");
      if (msg.includes("MARKET_DISABLED")) throw new Error("This market is currently disabled.");
      if (msg.includes("HIGH_ODDS_DISABLED")) throw new Error("High-odds markets are temporarily disabled.");
      if (msg.includes("MAX_BETS_PER_MATCH")) throw new Error("You have reached the maximum bets allowed on this match.");
      if (msg.includes("MAX_PAYOUT_NOT_CONFIGURED")) throw new Error("Bet placement is disabled: platform payout limit is not configured. Please contact an admin.");
      if (msg.includes("INSUFFICIENT_BALANCE")) throw new Error("Insufficient points balance. Request more points to place this bet.");
      if (msg.includes("MAX_EXPOSURE_REACHED")) throw new Error("The house has reached its exposure cap on this match. Try a smaller stake or wait for the cap to clear.");
      if (msg.includes("MAX_STAKE_EXCEEDED")) throw new Error("Stake exceeds the per-bet maximum set by the house.");
      if (msg.includes("MAX_PAYOUT_EXCEEDED")) {
        await supabaseAdmin.from("audit_log").insert({
          user_id: userId, action: "high_payout_attempt_blocked", entity: "prediction", entity_id: null,
          metadata: { market: data.market, outcome: data.outcome, stake: data.virtualStake, odds: data.referenceOdds },
        });
        throw new Error("Potential return exceeds platform limit.");
      }
      if (msg.includes("MATCH_LOCKED")) throw new Error("This match has already kicked off. Predictions are locked.");
      if (msg.includes("MARKET_SUSPENDED") || msg.includes("ODDS_NOT_TRUSTED") || msg.includes("ODDS_MISSING") || msg.includes("ODDS_AWAITING_SYNC") || msg.includes("ODDS_STALE")) {
        throw new Error("Market temporarily suspended while odds are being verified.");
      }
      if (msg.includes("HIGH_ODDS_STAKE_LIMIT")) throw new Error("This selection has a reduced stake limit. Please lower your stake.");
      if (msg.includes("MAX_SINGLE_BET_PAYOUT")) throw new Error("Potential return exceeds the per-bet limit.");
      if (msg.includes("MAX_OUTCOME_LIABILITY") || msg.includes("MAX_MATCH_LIABILITY")) throw new Error("This selection is temporarily limited due to platform risk controls.");
      if (msg.includes("CORRECT_SCORE_OTHER_LIMIT")) throw new Error("This selection is temporarily limited due to platform risk controls.");
      if (msg.includes("DUPLICATE_REQUEST")) throw new Error("Duplicate bet detected. Please refresh and try again.");
      if (msg.includes("USER_MATCH_STAKE_EXCEEDED")) throw new Error("You've reached your maximum stake on this match.");
      if (msg.includes("USER_MATCH_PAYOUT_EXCEEDED")) throw new Error("You've reached your maximum potential return on this match.");
      if (msg.includes("USER_DAILY_PAYOUT_EXCEEDED")) throw new Error("You've reached your 24-hour potential return limit. Try again later.");
      if (msg.includes("USER_CORRELATED_PAYOUT_EXCEEDED")) throw new Error("This pick is too similar to your other bets on this match. Lower the stake or choose a different market.");
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
