import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    if ((!odds || odds.length === 0) && (match as any).status === "scheduled") {
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
      if (msg.includes("INSUFFICIENT_BALANCE")) throw new Error("Insufficient points balance.");
      if (msg.includes("MATCH_LOCKED")) throw new Error("Match has kicked off — bets locked.");
      if (msg.includes("DUPLICATE_REQUEST")) throw new Error("You already have a bet on this market.");
      if (msg.includes("MAX_STAKE_EXCEEDED")) throw new Error("Stake exceeds per-bet maximum.");
      if (msg.includes("MAX_PAYOUT_EXCEEDED")) throw new Error("Potential payout exceeds maximum.");
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
