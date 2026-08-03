import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

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

function mapError(message: string): string {
  const m = message || "";
  if (m.includes("INSUFFICIENT_BALANCE")) return "Not enough points in your wallet.";
  if (m.includes("BELOW_MIN_STAKE")) return "Stake is below the minimum.";
  if (m.includes("ABOVE_MAX_STAKE")) return "Stake is above the maximum.";
  if (m.includes("MAINTENANCE_MODE")) return "Rock–Paper–Scissors is under maintenance.";
  if (m.includes("NO_ACTIVE_CONFIG")) return "Rock–Paper–Scissors is not configured yet.";
  if (m.includes("DAILY_LIMIT")) return "Daily round limit reached.";
  if (m.includes("EXPOSURE_LIMIT")) return "That stake exceeds the maximum return limit.";
  if (m.includes("ROUND_NOT_FOUND")) return "Round not found.";
  if (m.includes("ROUND_ALREADY_USED")) return "That round was already played.";
  if (m.includes("ROUND_EXPIRED")) return "That round expired — starting a fresh one.";
  if (m.includes("IDEMPOTENCY_CONFLICT")) return "That round was already played with a different move.";
  if (m.includes("INVALID_CHOICE")) return "Invalid move.";
  if (m.includes("INVALID_CLIENT_SEED")) return "Invalid client seed.";
  if (m.includes("UNAUTHORIZED")) return "Please sign in again.";
  return m || "Something went wrong.";
}

/** Everything safe to hand the browser about a settled round. */
const SETTLED_FIELDS =
  "id, status, player_choice, server_choice, outcome, stake, multiplier, gross_return, user_net, " +
  "client_seed, server_seed_hash, nonce, hmac_input, random_hex, verification_id, config_version, " +
  "prepared_at, settled_at, expires_at, processing_ms, created_at";

function publicRound(r: any) {
  if (!r) return null;
  return {
    id: r.id as string,
    status: String(r.status),
    playerChoice: r.player_choice as "ROCK" | "PAPER" | "SCISSORS" | null,
    serverChoice: r.server_choice as "ROCK" | "PAPER" | "SCISSORS" | null,
    outcome: r.outcome as "WIN" | "LOSS" | "DRAW" | null,
    stake: Number(r.stake ?? 0),
    multiplier: Number(r.multiplier ?? 0),
    grossReturn: Number(r.gross_return ?? 0),
    userNet: Number(r.user_net ?? 0),
    clientSeed: r.client_seed ?? null,
    serverSeedHash: r.server_seed_hash as string,
    nonce: Number(r.nonce ?? 0),
    hmacInput: r.hmac_input ?? null,
    randomHex: r.random_hex ?? null,
    verificationId: r.verification_id as string,
    settledAt: r.settled_at ?? null,
    processingMs: r.processing_ms == null ? null : Number(r.processing_ms),
  };
}

export type RpsRound = NonNullable<ReturnType<typeof publicRound>>;

/** Stake bounds, chip denominations and the published payout table. */
export const getRpsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("arcade_rps_configurations")
      .select(
        "id, version, min_stake, max_stake, chip_values, win_multiplier, draw_multiplier, " +
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
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      await enforceRateLimit(`rps:${userId}`, "arcade_rps");
    } catch (e) {
      if ((e as Error).message === "RATE_LIMITED") throw new Error("Too many rounds — please slow down.");
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("arcade_rps_prepare_round", {
      p_user: userId,
    });
    if (error) throw new Error(mapError(error.message));

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Could not prepare a round.");
    return {
      roundId: String(row.round_id),
      serverSeedHash: String(row.server_seed_hash),
      nonce: Number(row.nonce),
      expiresAt: String(row.expires_at),
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
    try {
      await enforceRateLimit(`rps:${userId}`, "arcade_rps");
    } catch (e) {
      if ((e as Error).message === "RATE_LIMITED") throw new Error("Too many rounds — please slow down.");
      throw e;
    }

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
    if (error) throw new Error(mapError(error.message));

    return { round: publicRound(Array.isArray(row) ? row[0] : row)! };
  });

/** Recover a settled round after a refresh, timeout or dropped connection. */
export const getRpsRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ roundId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("arcade_rps_rounds")
      .select(SETTLED_FIELDS)
      .eq("id", data.roundId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { round: null };
    // Never surface anything about an unplayed commitment beyond its status.
    if ((row as any).status !== "SETTLED") {
      return { round: null, status: String((row as any).status) };
    }
    return { round: publicRound(row) };
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
    const { data: row, error } = await supabase
      .from("arcade_rps_rounds")
      .select(SETTLED_FIELDS)
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
      round: publicRound(row)!,
      serverSeed: String(secret?.server_seed ?? ""),
      revealedAt: secret?.server_seed_revealed_at ?? null,
      preparedAt: (row as any).prepared_at as string,
    };
  });
