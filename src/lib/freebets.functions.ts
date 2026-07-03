import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

export const listStoreItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("csse_store_items")
      .select("id, item_key, kind, label, stake_amount, token_price, is_active, sort_order, metadata")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const purchaseFreeBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ itemKey: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item } = await (supabaseAdmin as any)
      .from("csse_store_items")
      .select("id, item_key, kind, stake_amount, token_price, is_active")
      .eq("item_key", data.itemKey).maybeSingle();
    if (!item) throw new Error("Item not found.");
    if (!item.is_active) throw new Error("Item unavailable.");
    if (item.kind !== "free_bet") throw new Error("Item not purchasable.");

    const { data: fbId, error } = await (supabaseAdmin as any).rpc("redeem_free_bet", {
      p_user_id: userId,
      p_stake_amount: item.stake_amount,
      p_token_cost: item.token_price,
      p_store_item: item.item_key,
    });
    if (error) {
      if ((error.message ?? "").includes("INSUFFICIENT_TOKENS")) {
        throw new Error("Not enough CSSE tokens.");
      }
      throw new Error(error.message);
    }
    return { id: fbId as string, stake: Number(item.stake_amount), price: Number(item.token_price) };
  });

export const listMyFreeBets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("csse_free_bets")
      .select("id, stake_amount, token_cost, status, prediction_id, created_at, consumed_at, settled_at, settled_outcome")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const all = data ?? [];
    const available = all.filter((f: any) => f.status === "available");
    return { all, available };
  });

// Free bets are restricted to the 90-minute match result market (1X2 only).
// Any other market is rejected server-side; the RPC enforces the same rule.
const PlaceSchema = z.object({
  freeBetId: z.string().uuid(),
  matchId: z.string().uuid(),
  market: z.literal("result"),
  outcome: z.enum(["HOME", "DRAW", "AWAY"]),
  referenceOdds: z.number().min(1).max(100000),
  clientRequestId: z.string().uuid().optional(),
});

export const placeFreeBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PlaceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try { await enforceRateLimit(`user:${userId}`, "bet_placement"); }
    catch (e) {
      if ((e as Error).message === "RATE_LIMITED") throw new Error("Too many requests. Please try again later.");
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-read server-side odds
    const { data: match } = await (supabaseAdmin as any)
      .from("matches").select("reference_odds").eq("id", data.matchId).maybeSingle();
    const refOdds = (match as any)?.reference_odds ?? null;
    if (!refOdds) throw new Error("Odds for this market are not available.");

    // Free bets are 1X2 only — pull 90-min result odds directly.
    const key = data.outcome === "HOME" ? "home" : data.outcome === "DRAW" ? "draw" : "away";
    const trustedOdds = Number(refOdds[key]);
    if (!Number.isFinite(trustedOdds) || trustedOdds < 1) {
      throw new Error("Odds for this market are not available.");
    }
    const drift = Math.abs(data.referenceOdds - trustedOdds) / trustedOdds;
    if (drift > 0.05) throw new Error("Odds have changed. Please refresh and try again.");

    const { data: snap } = await (supabaseAdmin as any)
      .from("match_odds_snapshots").select("id")
      .eq("match_id", data.matchId).order("sampled_at", { ascending: false }).limit(1).maybeSingle();

    const { data: predId, error } = await (supabaseAdmin as any).rpc("place_free_bet_atomic", {
      p_user_id: userId,
      p_free_bet_id: data.freeBetId,
      p_match_id: data.matchId,
      p_market: data.market,
      p_outcome: data.outcome,
      p_odds: trustedOdds,
      p_snapshot_id: (snap as any)?.id ?? null,
      p_client_request_id: data.clientRequestId ?? null,
    });
    if (error) {
      const m = error.message ?? "";
      if (m.includes("FREE_BET_NOT_FOUND")) throw new Error("This free bet could not be found.");
      if (m.includes("FREE_BET_UNAVAILABLE")) throw new Error("This free bet has already been used.");
      if (m.includes("FREE_BET_MARKET_NOT_ALLOWED") || m.includes("FREE_BET_OUTCOME_NOT_ALLOWED")) {
        throw new Error("Free bets can only be placed on the match result (Home / Draw / Away).");
      }
      if (m.includes("MATCH_LOCKED")) throw new Error("This match has already kicked off.");
      if (m.includes("MAX_PAYOUT_EXCEEDED")) throw new Error("Potential return exceeds platform limit.");
      if (m.includes("DUPLICATE_REQUEST")) throw new Error("Duplicate request. Please refresh and try again.");
      throw new Error(m || "Could not place free bet.");
    }
    return { id: predId as string };
  });
