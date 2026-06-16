import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

const MARKET_KEYS = [
  "over_under_2_5",
  "btts",
  "correct_score",
  "half_time_full_time",
  "exact_total_goals",
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

// Fetch all market odds for a match. Auto-seeds if empty.
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

    // On-demand seeding is restricted to simulation matches. Live production
    // matches must have odds derived from a real reference_odds sync; if the
    // seeder has not yet been triggered server-side after a sync, callers
    // must wait (bet placement is independently gated by odds_status).
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

    // Hide HT/FT for real matches that have no HT score support yet.
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

// Place a bet on one of the new markets.
const PlaceSchema = z.object({
  matchId: z.string().uuid(),
  market: z.enum(MARKET_KEYS),
  selection: z.string().min(1).max(40),
  stake: z.number().min(1).max(1_000_000),
  clientRequestId: z.string().uuid().optional(),
});

export const placeMarketBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlaceSchema.parse(input))
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
      if (msg.includes("BETTING_PAUSED")) throw new Error("Bet placement is temporarily paused.");
      if (msg.includes("MARKET_DISABLED")) throw new Error("This market is currently disabled.");
      if (msg.includes("HIGH_ODDS_DISABLED")) throw new Error("High-odds markets are temporarily disabled.");
      if (msg.includes("MAX_BETS_PER_MATCH")) throw new Error("You have reached the maximum bets allowed on this match.");
      if (msg.includes("MAX_PAYOUT_NOT_CONFIGURED")) throw new Error("Bet placement is disabled: platform payout limit is not configured. Please contact an admin.");
      if (msg.includes("INSUFFICIENT_BALANCE")) throw new Error("Insufficient points balance.");
      if (msg.includes("MATCH_LOCKED")) throw new Error("Match has kicked off — bets locked.");
      if (msg.includes("MARKET_SUSPENDED") || msg.includes("ODDS_NOT_TRUSTED") || msg.includes("ODDS_MISSING") || msg.includes("ODDS_AWAITING_SYNC") || msg.includes("ODDS_STALE")) {
        throw new Error("Market temporarily suspended while odds are being verified.");
      }
      if (msg.includes("HIGH_ODDS_STAKE_LIMIT")) throw new Error("This selection has a reduced stake limit. Please lower your stake.");
      if (msg.includes("MAX_SINGLE_BET_PAYOUT")) throw new Error("Potential return exceeds the per-bet limit.");
      if (msg.includes("MAX_OUTCOME_LIABILITY") || msg.includes("MAX_MATCH_LIABILITY") || msg.includes("CORRECT_SCORE_OTHER_LIMIT")) {
        throw new Error("This selection is temporarily limited due to platform risk controls.");
      }
      if (msg.includes("DUPLICATE_REQUEST")) throw new Error("Duplicate submit detected — please try again.");
      if (msg.includes("MAX_STAKE_EXCEEDED")) throw new Error("Stake exceeds per-bet maximum.");
      if (msg.includes("MAX_PAYOUT_EXCEEDED")) {
        await supabaseAdmin.from("audit_log").insert({
          user_id: userId, action: "high_payout_attempt_blocked", entity: "prediction", entity_id: null,
          metadata: { market: data.market, selection: data.selection, stake: data.stake },
        });
        throw new Error("Potential return exceeds platform limit.");
      }
      if (msg.includes("odds unavailable")) throw new Error("Odds unavailable for that selection.");
      throw new Error(msg || "Could not place bet.");
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

// Admin: exposure grouped by match/market/selection.
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
