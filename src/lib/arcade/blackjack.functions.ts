import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

/**
 * Blackjack Arcade — user-facing server functions.
 *
 * Hands are staked with real wallet points: the stake is debited on the deal
 * and any payout is credited back at settlement, all inside the database.
 *
 * Every authoritative decision (shuffle, deal, hit, stand, double, split,
 * dealer play, settlement, scoring) happens inside SECURITY DEFINER Postgres
 * routines. Nothing here trusts a client-supplied card, total or result, and
 * face-down cards are never serialised to the browser.
 */

function mapError(message: string): string {
  const m = message || "";
  if (m.includes("INSUFFICIENT_BALANCE")) return "Not enough points in your wallet for that stake.";
  if (m.includes("BELOW_MIN_STAKE")) return "That stake is below the table minimum.";
  if (m.includes("ABOVE_MAX_STAKE")) return "That stake is above the table maximum.";
  if (m.includes("EXPOSURE_LIMIT")) return "That stake exceeds the table payout limit.";

  if (m.includes("DAILY_LIMIT")) return "Daily hand limit reached.";
  if (m.includes("ACTIVE_HAND_EXISTS")) return "You already have a hand in progress.";
  if (m.includes("ACTION_NOT_ALLOWED")) return "That action isn't available right now.";
  if (m.includes("STALE_STATE")) return "Your view was out of date — refreshed to the latest state.";
  if (m.includes("HAND_NOT_FOUND")) return "Hand not found.";
  if (m.includes("HAND_NOT_SETTLED")) return "You can verify a hand once it's settled.";
  if (m.includes("MAINTENANCE_MODE")) return "Blackjack is under maintenance.";
  if (m.includes("NOT_CONFIGURED")) return "Blackjack isn't configured yet.";
  if (m.includes("SHOE_EXHAUSTED")) return "The shoe ran out — deal again for a fresh one.";
  if (m.includes("INVALID_CLIENT_SEED")) return "Invalid client seed.";
  if (m.includes("RATE_LIMITED")) return "Slow down a moment and try again.";
  return m || "Something went wrong.";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type BjCard = {
  id: string;
  owner: "PLAYER" | "DEALER";
  playerHandId: string | null;
  sequence: number;
  faceUp: boolean;
  rank: number | null;
  suit: number | null;
};

const HAND_FIELDS =
  "id, status, result, result_reason, dealer_total, dealer_soft, dealer_bust, dealer_blackjack, " +
  "total_score_awarded, total_stake, total_payout, user_net, " +
  "state_version, action_sequence, client_seed, server_seed_hash, nonce, " +
  "rule_version, score_version, expires_at, created_at, settled_at";

/** Reads the full hand state, masking any face-down card. */
async function readHandState(db: any, handId: string, userId: string) {
  const { data: hand, error } = await db
    .from("arcade_bj_hands")
    .select(HAND_FIELDS)
    .eq("id", handId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!hand) throw new Error("Hand not found.");

  const [phRes, cardRes] = await Promise.all([
    db
      .from("arcade_bj_player_hands")
      .select(
        "id, hand_index, status, result, final_total, is_soft, is_bust, is_blackjack, " +
          "is_doubled, is_split, is_split_ace, score_awarded",
      )
      .eq("hand_id", handId)
      .order("hand_index", { ascending: true }),
    db
      .from("arcade_bj_cards")
      .select("id, owner_type, player_hand_id, rank, suit, deal_sequence, face_up")
      .eq("hand_id", handId)
      .order("deal_sequence", { ascending: true }),
  ]);
  if (phRes.error) throw new Error(phRes.error.message);
  if (cardRes.error) throw new Error(cardRes.error.message);

  const cards: BjCard[] = (cardRes.data ?? []).map((c: any) => ({
    id: c.id,
    owner: c.owner_type,
    playerHandId: c.player_hand_id,
    sequence: c.deal_sequence,
    faceUp: c.face_up,
    // Hole-card values never leave the server until they are turned over.
    rank: c.face_up ? c.rank : null,
    suit: c.face_up ? c.suit : null,
  }));

  return { hand, playerHands: phRes.data ?? [], cards };
}

/** Active rules + scoring table. */
export const getBlackjackConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [rulesRes, scoreRes] = await Promise.all([
      supabase
        .from("arcade_bj_rule_configs")
        .select(
          "id, version, deck_count, penetration, dealer_hits_soft_17, dealer_peek, double_allowed, " +
            "double_after_split, max_split_hands, resplit_allowed, resplit_aces, hit_split_aces, " +
            "auto_stand_on_21, action_timeout_seconds, min_stake, max_stake, blackjack_payout, " +
            "max_payout, chip_values, daily_hand_limit, maintenance_mode, announcement",

        )
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("arcade_bj_score_configs")
        .select(
          "id, version, natural_blackjack_score, win_score, five_card_win_score, double_win_score, " +
            "split_win_score, push_score, loss_score, max_score_per_round",
        )
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (rulesRes.error) throw new Error(rulesRes.error.message);
    if (scoreRes.error) throw new Error(scoreRes.error.message);
    if (!rulesRes.data || !scoreRes.data) throw new Error("Blackjack isn't configured yet.");
    return { rules: rulesRes.data as any, scoring: scoreRes.data as any };
  });

/** Wallet balance, arcade score and recent results. */
export const getBlackjackProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [walletRes, scoreRes, recentRes, todayRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("arcade_bj_score_balances")
        .select("total_score")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("arcade_bj_hands")
        .select(
          "id, result, status, total_stake, total_payout, user_net, total_score_awarded, dealer_total, created_at, settled_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("arcade_bj_hands")
        .select("user_net, status")
        .eq("user_id", userId)
        .eq("status", "COMPLETED")
        .gte("created_at", startOfDay.toISOString()),
    ]);

    const todayRows = (todayRes.data ?? []) as any[];
    let todayNet = 0;
    let todayWins = 0;
    let todayLosses = 0;
    for (const r of todayRows) {
      const net = Number(r.user_net ?? 0);
      todayNet += net;
      if (net > 0) todayWins += 1;
      else if (net < 0) todayLosses += 1;
    }

    return {
      balance: Number((walletRes.data as any)?.balance ?? 0),
      score: Number(scoreRes.data?.total_score ?? 0),
      recent: (recentRes.data ?? []) as any[],
      todayNet,
      todayWins,
      todayLosses,
      todayHands: todayRows.length,
    };
  });


/** Current in-progress hand, if any. */
export const getActiveBlackjackHand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const db = await admin();
    const { data, error } = await db
      .from("arcade_bj_hands")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["CREATED", "DEALING", "PLAYER_TURN", "DEALER_CHECK", "DEALER_TURN", "SETTLING"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { state: null };
    return { state: await readHandState(db, data.id, userId) };
  });

/** Read one hand (in-progress or settled). */
export const getBlackjackHand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ handId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    return { state: await readHandState(db, data.handId, context.userId) };
  });

/** Deal a new hand — debits the stake from the points wallet. */
export const startBlackjackHand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        stake: z.number().positive().max(100000),
        clientSeed: z.string().trim().min(4).max(128),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await enforceRateLimit(`user:${userId}`, "blackjack_action");
    const db = await admin();
    const { data: handId, error } = await db.rpc("arcade_bj_start_hand", {
      p_user: userId,
      p_stake: data.stake,
      p_client_seed: data.clientSeed,
      p_idempotency_key: data.idempotencyKey,
    });

    if (error) throw new Error(mapError(error.message));
    return { state: await readHandState(db, handId, userId) };
  });

const actionInput = (i: unknown) =>
  z
    .object({
      handId: z.string().uuid(),
      playerHandId: z.string().uuid(),
      stateVersion: z.number().int().nonnegative(),
      idempotencyKey: z.string().trim().min(8).max(128),
    })
    .parse(i);

async function runAction(rpc: string, userId: string, data: any) {
  await enforceRateLimit(`user:${userId}`, "blackjack_action");
  const db = await admin();
  const { error } = await db.rpc(rpc, {
    p_user: userId,
    p_hand: data.handId,
    p_player_hand: data.playerHandId,
    p_state_version: data.stateVersion,
    p_idempotency_key: data.idempotencyKey,
  });
  if (error) throw new Error(mapError(error.message));
  return { state: await readHandState(db, data.handId, userId) };
}

/** Draw one card. */
export const hitBlackjack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionInput)
  .handler(({ data, context }) => runAction("arcade_bj_hit", context.userId, data));

/** Stand and let the dealer play out. */
export const standBlackjack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionInput)
  .handler(({ data, context }) => runAction("arcade_bj_stand", context.userId, data));

/** Take exactly one card at a doubled score, then stand. */
export const doubleBlackjack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionInput)
  .handler(({ data, context }) => runAction("arcade_bj_double", context.userId, data));

/** Split a pair into two hands. */
export const splitBlackjack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionInput)
  .handler(({ data, context }) => runAction("arcade_bj_split", context.userId, data));
