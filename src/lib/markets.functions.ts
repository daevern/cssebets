import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

export const MARKET_KEYS = [
  "over_under_0_5",
  "over_under_1_5",
  "over_under_2_5",
  "over_under_3_5",
  "over_under_4_5",
  "over_under_5_5",
  "over_under_6_5",
  "btts",
  "correct_score",
  "half_time_full_time",
  "exact_total_goals",
  "to_qualify",
  "double_chance",
  "draw_no_bet",
  "goals_odd_even",
  "clean_sheet_home",
  "clean_sheet_away",
  "win_to_nil_home",
  "win_to_nil_away",
  "cards_over_under_2_5",
  "cards_over_under_3_5",
  "cards_over_under_4_5",
  "cards_over_under_5_5",
  "home_cards_over_under_1_5",
  "away_cards_over_under_1_5",
  "red_card_match",
  "first_card",
  "corners_over_under_8_5",
  "corners_over_under_9_5",
  "corners_over_under_10_5",
  "corners_over_under_11_5",
  "home_corners_over_under_4_5",
  "away_corners_over_under_4_5",
  "first_corner",
] as const;

type MarketOdds = {
  id: string;
  match_id: string;
  market: string;
  selection: string;
  odds: number;
  active: boolean;
  source: string;
};

export const PlaceMarketBetSchema = z.object({
  matchId: z.string().uuid(),
  market: z.enum(MARKET_KEYS),
  selection: z.string().min(1).max(40),
  stake: z.number().min(1).max(1_000_000),
  clientRequestId: z.string().uuid().optional(),
});

export function mapPlaceMarketBetErrorMessage(message = "") {
  if (message.includes("BETTING_PAUSED")) return "Bet placement is temporarily paused.";
  if (message.includes("MARKET_DISABLED")) return "This market is currently disabled.";
  if (message.includes("HIGH_ODDS_DISABLED")) return "High-odds markets are temporarily disabled.";
  if (message.includes("MAX_BETS_PER_MATCH")) return "You have reached the maximum bets allowed on this match.";
  if (message.includes("MAX_PAYOUT_NOT_CONFIGURED")) return "Bet placement is disabled: platform payout limit is not configured. Please contact an admin.";
  if (message.includes("INSUFFICIENT_BALANCE")) return "Insufficient points balance.";
  if (message.includes("MATCH_LOCKED")) return "Match has kicked off — bets locked.";
  if (
    message.includes("MARKET_SUSPENDED") ||
    message.includes("ODDS_NOT_TRUSTED") ||
    message.includes("ODDS_MISSING") ||
    message.includes("ODDS_AWAITING_SYNC") ||
    message.includes("ODDS_STALE")
  ) {
    return "Market temporarily suspended while odds are being verified.";
  }
  if (message.includes("HIGH_ODDS_STAKE_LIMIT")) return "This selection has a reduced stake limit. Please lower your stake.";
  if (message.includes("MAX_SINGLE_BET_PAYOUT")) return "Potential return exceeds the per-bet limit.";
  if (message.includes("MAX_OUTCOME_LIABILITY") || message.includes("MAX_MATCH_LIABILITY") || message.includes("CORRECT_SCORE_OTHER_LIMIT")) {
    return "This selection is temporarily limited due to platform risk controls.";
  }
  if (message.includes("DUPLICATE_REQUEST")) return "Duplicate submit detected — please try again.";
  if (message.includes("MAX_STAKE_EXCEEDED")) return "Stake exceeds per-bet maximum.";
  if (message.includes("MAX_PAYOUT_EXCEEDED")) return "Potential return exceeds platform limit.";
  if (message.includes("USER_MATCH_STAKE_EXCEEDED")) return "You've reached your maximum stake on this match.";
  if (message.includes("USER_MATCH_PAYOUT_EXCEEDED")) return "You've reached your maximum potential return on this match.";
  if (message.includes("USER_DAILY_PAYOUT_EXCEEDED")) return "You've reached your 24-hour potential return limit. Try again later.";
  if (message.includes("USER_CORRELATED_PAYOUT_EXCEEDED")) return "This pick is too similar to your other bets on this match. Lower the stake or choose a different market.";
  if (message.includes("odds unavailable")) return "Odds unavailable for that selection.";
  return message || "Could not place bet.";
}

export const getMatchMarkets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string }) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("id, status, kickoff_at, is_simulation, home_score_ht, away_score_ht")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) throw new Error("Match not found");

    let { data: odds } = await supabaseAdmin
      .from("match_market_odds")
      .select("id, match_id, market, selection, odds, active, source")
      .eq("match_id", data.matchId)
      .eq("active", true);

    if (
      (!odds || odds.length === 0) &&
      (match as any).status === "scheduled" &&
      (match as any).is_simulation === true
    ) {
      await (supabaseAdmin as any).rpc("seed_match_market_odds", { p_match_id: data.matchId });
      const r = await supabaseAdmin
        .from("match_market_odds")
        .select("id, match_id, market, selection, odds, active, source")
        .eq("match_id", data.matchId)
        .eq("active", true);
      odds = r.data ?? [];
    }

    const hasHtSupport =
      (match as any).is_simulation === true ||
      (match as any).home_score_ht !== null;
    const filtered = (odds ?? []).filter(
      (o: MarketOdds) =>
        MARKET_KEYS.includes(o.market as any) &&
        (o.market !== "half_time_full_time" || hasHtSupport),
    );

    return { odds: filtered as MarketOdds[], hasHtSupport };
  });

export const placeMarketBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlaceMarketBetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
    const { data: predId, error } = await (supabaseAdmin as any).rpc("place_market_bet_atomic", {
      p_user_id: userId,
      p_match_id: data.matchId,
      p_market: data.market,
      p_selection: data.selection,
      p_stake: data.stake,
      p_client_request_id: data.clientRequestId ?? null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("MAX_PAYOUT_EXCEEDED")) {
        await supabaseAdmin.from("audit_log").insert({
          user_id: userId, action: "high_payout_attempt_blocked", entity: "prediction", entity_id: null,
          metadata: { market: data.market, selection: data.selection, stake: data.stake },
        });
      }
      throw new Error(mapPlaceMarketBetErrorMessage(msg));
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "prediction.market_submit",
      entity: "prediction",
      entity_id: predId as any,
      metadata: { market: data.market, selection: data.selection, stake: data.stake },
    });

    return { id: predId };
  });

export const getMarketExposure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("match_market_exposure" as any)
      .select("*")
      .order("liability", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
