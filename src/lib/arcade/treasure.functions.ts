import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, isRateLimitError } from "@/lib/rate-limit.functions";
import { requireApprovedMember } from "@/lib/access-control";

/**
 * Treasure Grid — user-facing server functions.
 *
 * All authoritative work (board generation, multipliers, wallet movements)
 * happens inside SECURITY DEFINER Postgres routines. Nothing here trusts a
 * client-supplied multiplier, return, tile result or balance.
 */

const ROUND_PUBLIC_FIELDS =
  "id, status, difficulty, grid_rows, grid_cols, trap_count, stake, gross_return, user_net, " +
  "current_multiplier, final_multiplier, safe_reveals, selected_trap_index, config_version, " +
  "rtp_version, client_seed, server_seed_hash, nonce, verification_id, state_version, " +
  "result_reason, started_at, last_action_at, settled_at, expires_at, created_at";

function mapError(message: string): string {
  const m = message || "";
  if (m.includes("INSUFFICIENT_BALANCE")) return "Not enough points in your wallet.";
  if (m.includes("BELOW_MIN_STAKE")) return "Stake is below the minimum.";
  if (m.includes("ABOVE_MAX_STAKE")) return "Stake is above the maximum.";
  if (m.includes("ACTIVE_ROUND_EXISTS")) return "You already have an active round.";
  if (m.includes("INVALID_DIFFICULTY")) return "That difficulty is not available.";
  if (m.includes("MAINTENANCE_MODE")) return "Treasure Grid is under maintenance.";
  if (m.includes("DAILY_LIMIT")) return "Daily round limit reached.";
  if (m.includes("EXPOSURE_LIMIT")) return "That stake exceeds the maximum return limit.";
  if (m.includes("ROUND_NOT_ACTIVE")) return "This round has already been settled.";
  if (m.includes("ROUND_NOT_FOUND")) return "Round not found.";
  if (m.includes("STALE_STATE")) return "Your view was out of date — refreshed to the latest state.";
  if (m.includes("TILE_ALREADY_OPEN")) return "That tile is already open.";
  if (m.includes("INVALID_TILE")) return "Invalid tile.";
  if (m.includes("NOTHING_TO_COLLECT")) return "Reveal a safe tile before collecting.";
  return m || "Something went wrong.";
}

function publicRound(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    difficulty: r.difficulty,
    grid_rows: Number(r.grid_rows),
    grid_cols: Number(r.grid_cols),
    trap_count: Number(r.trap_count),
    stake: Number(r.stake),
    gross_return: Number(r.gross_return ?? 0),
    user_net: Number(r.user_net ?? 0),
    current_multiplier: Number(r.current_multiplier ?? 1),
    final_multiplier: r.final_multiplier == null ? null : Number(r.final_multiplier),
    safe_reveals: Number(r.safe_reveals ?? 0),
    selected_trap_index: r.selected_trap_index == null ? null : Number(r.selected_trap_index),
    config_version: Number(r.config_version),
    rtp_version: Number(r.rtp_version),
    client_seed: r.client_seed,
    server_seed_hash: r.server_seed_hash,
    nonce: Number(r.nonce),
    verification_id: r.verification_id,
    state_version: Number(r.state_version),
    result_reason: r.result_reason ?? null,
    expires_at: r.expires_at,
    created_at: r.created_at,
  };
}

export type TreasureRound = NonNullable<ReturnType<typeof publicRound>>;

/** Active difficulty profiles + their published multiplier tables. */
export const getTreasureConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: configs, error } = await supabase
      .from("arcade_treasure_configurations")
      .select(
        "id, difficulty, label, version, rtp_version, grid_rows, grid_cols, trap_count, target_rtp, min_stake, max_stake, max_return, max_multiplier, chip_values, round_timeout_seconds, daily_round_limit, cooldown_seconds, maintenance_mode, announcement",
      )
      .eq("status", "active")
      .order("trap_count", { ascending: true });
    if (error) throw new Error(error.message);
    if (!configs?.length) throw new Error("Treasure Grid is not configured yet.");

    const { data: tables, error: tErr } = await supabase
      .from("arcade_treasure_multiplier_tables")
      .select("config_id, safe_reveals, survival_probability, actual_multiplier, display_multiplier")
      .in(
        "config_id",
        configs.map((c: any) => c.id),
      )
      .order("safe_reveals", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    return {
      configs: configs as any[],
      multipliers: (tables ?? []) as any[],
    };
  });

/** Wallet balance + today's / lifetime Treasure Grid summary. */
export const getTreasureProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [walletRes, todayRes, allRes, recentRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("arcade_treasure_rounds")
        .select("stake, gross_return, user_net, status")
        .eq("user_id", userId)
        .gte("created_at", startOfDay),
      supabase.from("arcade_treasure_rounds").select("status, user_net, safe_reveals").eq("user_id", userId),
      supabase
        .from("arcade_treasure_rounds")
        .select("id, difficulty, stake, gross_return, user_net, status, final_multiplier, safe_reveals, created_at")
        .eq("user_id", userId)
        .not("settled_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const today = (todayRes.data ?? []) as any[];
    const all = (allRes.data ?? []) as any[];
    const count = (s: string) => all.filter((r) => r.status === s).length;

    return {
      balance: Number(walletRes.data?.balance ?? 0),
      todayNet: today.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      todayStaked: today.reduce((a, r) => a + Number(r.stake ?? 0), 0),
      todayRounds: today.length,
      totalRounds: all.length,
      totalWins: count("WON"),
      totalLosses: count("LOST"),
      totalPushes: count("PUSH"),
      lifetimeNet: all.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      bestSafeReveals: all.reduce((a, r) => Math.max(a, Number(r.safe_reveals ?? 0)), 0),
      recent: (recentRes.data ?? []) as any[],
    };
  });

/** Restore an in-flight round after refresh / reconnect. Never leaks traps. */
export const getActiveTreasureRound = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: round, error } = await supabase
      .from("arcade_treasure_rounds")
      .select(ROUND_PUBLIC_FIELDS)
      .eq("user_id", userId)
      .in("status", ["CREATED", "ACTIVE", "COLLECTING"])
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!round) return { round: null, revealed: [] as { tile_index: number; tile_type: string }[] };

    const { data: actions } = await supabase
      .from("arcade_treasure_round_actions")
      .select("tile_index, outcome, action_sequence")
      .eq("round_id", (round as any).id)
      .eq("action_type", "REVEAL")
      .order("action_sequence", { ascending: true });

    return {
      round: round as any,
      revealed: (actions ?? []).map((a: any) => ({
        tile_index: Number(a.tile_index),
        tile_type: String(a.outcome),
      })),
    };
  });

export const startTreasureRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        difficulty: z.enum(["easy", "medium", "hard"]),
        stake: z.number().int().positive().max(100000),
        clientSeed: z.string().trim().min(4).max(128),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    try {
      await enforceRateLimit(`treasure:${userId}`, "arcade_treasure");
    } catch (e) {
      if (isRateLimitError(e)) throw new Error("Too many rounds — please slow down.");
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: round, error } = await (supabaseAdmin as any).rpc("arcade_treasure_start_round", {
      p_user: userId,
      p_difficulty: data.difficulty,
      p_stake: data.stake,
      p_client_seed: data.clientSeed,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapError(error.message));

    const r = Array.isArray(round) ? round[0] : round;
    return { round: publicRound(r), revealed: [] as { tile_index: number; tile_type: string }[] };
  });

export const revealTreasureTile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        roundId: z.string().uuid(),
        tileIndex: z.number().int().min(0).max(63),
        stateVersion: z.number().int().min(0),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      await enforceRateLimit(`treasure:${userId}`, "arcade_treasure");
    } catch (e) {
      if (isRateLimitError(e)) throw new Error("Too many actions — please slow down.");
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin as any).rpc("arcade_treasure_reveal_tile", {
      p_user: userId,
      p_round: data.roundId,
      p_tile: data.tileIndex,
      p_state_version: data.stateVersion,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapError(error.message));

    return {
      tileIndex: Number(res.tile_index),
      tileType: String(res.tile_type) as "SAFE" | "TRAP",
      round: publicRound(res.round),
      traps: (res.traps ?? null) as number[] | null,
    };
  });

export const collectTreasureRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        roundId: z.string().uuid(),
        stateVersion: z.number().int().min(0),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin as any).rpc("arcade_treasure_collect", {
      p_user: userId,
      p_round: data.roundId,
      p_state_version: data.stateVersion,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapError(error.message));

    return { round: publicRound(res.round), traps: (res.traps ?? null) as number[] | null };
  });

/** Paginated round history. */
export const getTreasureHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(500).default(0),
        pageSize: z.number().int().min(5).max(50).default(20),
        difficulty: z.enum(["all", "easy", "medium", "hard"]).default("all"),
        status: z.enum(["all", "WON", "LOST", "PUSH", "VOID", "REVERSED", "EXPIRED"]).default("all"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("arcade_treasure_rounds")
      .select(
        "id, difficulty, trap_count, stake, gross_return, user_net, safe_reveals, final_multiplier, status, result_reason, verification_id, created_at, settled_at",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .not("settled_at", "is", null);

    if (data.difficulty !== "all") q = q.eq("difficulty", data.difficulty);
    if (data.status !== "all") q = q.eq("status", data.status);

    const from = data.page * data.pageSize;
    const { data: rows, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    return { rows: (rows ?? []) as any[], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });
