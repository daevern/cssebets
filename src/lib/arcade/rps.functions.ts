import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Rock–Paper–Scissors — user-facing server functions.
 *
 * Two-phase flow:
 *   1. `prepareRpsRound` commits a hidden server seed and publishes only its
 *      SHA-256 fingerprint. This ALWAYS happens before the player can choose.
 *   2. `settleRpsRound` atomically charges the stake, derives the server move
 *      from the already-committed seed, pays any return and posts the journal.
 *
 * The client can only ever send: round id, its own move, a client seed, a
 * stake and an idempotency key. There is no code path that reads a
 * client-supplied server move, outcome, multiplier, return or balance.
 */

export type RpsRound = {
  id: string;
  status: string;
  playerChoice: "ROCK" | "PAPER" | "SCISSORS" | null;
  serverChoice: "ROCK" | "PAPER" | "SCISSORS" | null;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
  stake: number;
  multiplier: number;
  grossReturn: number;
  userNet: number;
  clientSeed: string | null;
  serverSeedHash: string;
  nonce: number;
  hmacInput: string | null;
  randomHex: string | null;
  verificationId: string;
  settledAt: string | null;
  processingMs: number | null;
};

/** Stake bounds, chip denominations and the published payout table. */
export const getRpsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("arcade_rps_configurations")
      .select(
        "id, version, min_stake, max_stake, chip_values, win_multiplier, opening_win_multiplier, draw_multiplier, " +
          "round_ttl_seconds, daily_round_limit, cooldown_seconds, maintenance_mode, announcement",
      )
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Rock–Paper–Scissors is not configured yet.");
    return { config: data as any };
  });

/** Wallet balance plus today's / lifetime RPS summary. */
export const getRpsProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [walletRes, todayRes, allRes, recentRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("arcade_rps_rounds")
        .select("stake, gross_return, user_net, outcome")
        .eq("user_id", userId)
        .eq("status", "SETTLED")
        .gte("created_at", startOfDay),
      supabase
        .from("arcade_rps_rounds")
        .select("outcome, user_net")
        .eq("user_id", userId)
        .eq("status", "SETTLED"),
      supabase
        .from("arcade_rps_rounds")
        .select("id, player_choice, server_choice, outcome, stake, user_net, settled_at")
        .eq("user_id", userId)
        .eq("status", "SETTLED")
        .order("settled_at", { ascending: false })
        .limit(12),
    ]);

    const today = (todayRes.data ?? []) as any[];
    const all = (allRes.data ?? []) as any[];
    const count = (rows: any[], o: string) => rows.filter((r) => r.outcome === o).length;

    return {
      balance: Number(walletRes.data?.balance ?? 0),
      todayNet: today.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      todayStaked: today.reduce((a, r) => a + Number(r.stake ?? 0), 0),
      todayRounds: today.length,
      todayWins: count(today, "WIN"),
      todayLosses: count(today, "LOSS"),
      todayDraws: count(today, "DRAW"),
      totalRounds: all.length,
      totalWins: count(all, "WIN"),
      totalLosses: count(all, "LOSS"),
      totalDraws: count(all, "DRAW"),
      lifetimeNet: all.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      recent: (recentRes.data ?? []) as any[],
    };
  });

/**
 * Commit hidden randomness. Returns the fingerprint only — never the seed,
 * never a move. Called before the Rock/Paper/Scissors buttons are enabled.
 */
export const prepareRpsRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ parentRoundId: z.string().uuid().optional() })
      .optional()
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { enforceRpsRateLimit, mapRpsError } = await import("@/lib/arcade/rps.server");
    await enforceRpsRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await (supabaseAdmin as any).rpc("arcade_rps_prepare_round", {
      p_user: userId,
      p_parent_round_id: data?.parentRoundId ?? null,
    });
    if (error) throw new Error(mapRpsError(error.message));

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) throw new Error("Could not prepare a round.");
    return {
      roundId: String(row.out_round_id ?? row.round_id),
      serverSeedHash: String(row.out_server_seed_hash ?? row.server_seed_hash),
      nonce: Number(row.out_nonce ?? row.nonce),
      expiresAt: String(row.out_expires_at ?? row.expires_at),
    };
  });

/**
 * Authoritative settlement. One transaction: consume the round, charge the
 * stake, derive the server move from the committed seed, pay, journal.
 */
export const settleRpsRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        roundId: z.string().uuid(),
        playerChoice: z.enum(["ROCK", "PAPER", "SCISSORS"]),
        clientSeed: z.string().trim().min(4).max(128),
        stake: z.number().positive().max(100000),
        idempotencyKey: z.string().trim().min(8).max(128),
        clientRevealMs: z.number().int().min(0).max(600000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { enforceRpsRateLimit, mapRpsError, publicRpsRound } = await import("@/lib/arcade/rps.server");
    await enforceRpsRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_rps_settle", {
      p_user: userId,
      p_round_id: data.roundId,
      p_player_choice: data.playerChoice,
      p_client_seed: data.clientSeed,
      p_stake: data.stake,
      p_idempotency_key: data.idempotencyKey,
      p_client_reveal_ms: data.clientRevealMs ?? null,
    });
    if (error) throw new Error(mapRpsError(error.message));

    return { round: publicRpsRound(Array.isArray(row) ? row[0] : row)! };
  });

/** Recover a settled round after a refresh, timeout or dropped connection. */
export const getRpsRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ roundId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { SETTLED_RPS_FIELDS, publicRpsRound } = await import("@/lib/arcade/rps.server");
    const { data: row, error } = await supabase
      .from("arcade_rps_rounds")
      .select(SETTLED_RPS_FIELDS)
      .eq("id", data.roundId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { round: null };
    // Never surface anything about an unplayed commitment beyond its status.
    if ((row as any).status !== "SETTLED") {
      return { round: null, status: String((row as any).status) };
    }
    return { round: publicRpsRound(row) };
  });

/**
 * Provably-fair reveal. Only ever returns the seed for a SETTLED round, so a
 * player can never learn the server move before their choice is locked in.
 */
export const revealRpsRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ roundId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { SETTLED_RPS_FIELDS, publicRpsRound } = await import("@/lib/arcade/rps.server");
    const { data: row, error } = await supabase
      .from("arcade_rps_rounds")
      .select(SETTLED_RPS_FIELDS)
      .eq("id", data.roundId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Round not found.");
    if ((row as any).status !== "SETTLED") {
      throw new Error("This round has not been played yet.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secret } = await (supabaseAdmin as any)
      .from("arcade_rps_rounds")
      .select("server_seed, server_seed_revealed_at")
      .eq("id", data.roundId)
      .maybeSingle();

    return {
      round: publicRpsRound(row)!,
      serverSeed: String(secret?.server_seed ?? ""),
      revealedAt: secret?.server_seed_revealed_at ?? null,
      preparedAt: (row as any).prepared_at as string,
    };
  });
