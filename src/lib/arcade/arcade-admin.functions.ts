import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Arcade — cross-game admin/oversight server functions.
 *
 * Every handler verifies the caller's staff role through the *user's* client
 * (RLS applies) before any privileged read/write happens.
 */

async function assertStaff(context: any, opts: { write?: boolean } = {}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const allowed = opts.write ? isAdmin : isAdmin || roles.includes("viewer");
  if (!allowed) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type ArcadeGame = "plinko" | "roulette" | "treasure" | "blackjack" | "rps";

export type ArcadeGameSnapshot = {
  game: ArcadeGame;
  livePlayers: number;
  liveRounds: number;
  liveStake: number;
  reserved: number;
  rounds: number;
  players: number;
  staked: number;
  paid: number;
  houseNet: number;
  margin: number | null;
};

export type ArcadeActivityRow = {
  game: ArcadeGame;
  id: string;
  userId: string;
  username: string | null;
  stake: number;
  payout: number;
  result: string | null;
  createdAt: string;
};

/** Live activity + windowed performance for every arcade game, in one call. */
export const arcadeAdminSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ windowHours: z.number().int().min(1).max(720).default(24) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await assertStaff(context);
    const { data: snap, error } = await db.rpc("arcade_admin_snapshot", {
      p_admin: context.userId,
      p_window_hours: data.windowHours,
    });
    if (error) throw new Error(error.message);
    const s = (snap ?? {}) as any;
    return {
      windowHours: Number(s.windowHours ?? data.windowHours),
      availableReserve: s.availableReserve === null ? null : Number(s.availableReserve ?? 0),
      generatedAt: String(s.generatedAt ?? new Date().toISOString()),
      games: ((s.games ?? []) as any[]).map((g) => ({
        game: g.game as ArcadeGame,
        livePlayers: Number(g.livePlayers ?? 0),
        liveRounds: Number(g.liveRounds ?? 0),
        liveStake: Number(g.liveStake ?? 0),
        reserved: Number(g.reserved ?? 0),
        rounds: Number(g.rounds ?? 0),
        players: Number(g.players ?? 0),
        staked: Number(g.staked ?? 0),
        paid: Number(g.paid ?? 0),
        houseNet: Number(g.houseNet ?? 0),
        margin: g.margin === null || g.margin === undefined ? null : Number(g.margin),
      })) as ArcadeGameSnapshot[],
      activity: ((s.activity ?? []) as any[]).map((a) => ({
        game: a.game as ArcadeGame,
        id: String(a.id),
        userId: String(a.userId),
        username: a.username ?? null,
        stake: Number(a.stake ?? 0),
        payout: Number(a.payout ?? 0),
        result: a.result ?? null,
        createdAt: String(a.createdAt),
      })) as ArcadeActivityRow[],
    };
  });

/** Active published configuration for every arcade game (margin controls). */
export const arcadeAdminConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertStaff(context);
    const [roulette, rps, treasure, bjRules, bjScores, plinko] = await Promise.all([
      db
        .from("arcade_roulette_configurations")
        .select(
          "id, version, status, chip_values, min_total_stake, max_total_stake, max_stake_per_position, max_positions, daily_spin_limit, cooldown_seconds, maintenance_mode, announcement",
        )
        .eq("status", "active")
        .maybeSingle(),
      db
        .from("arcade_rps_configurations")
        .select(
          "id, version, status, min_stake, max_stake, chip_values, win_multiplier, draw_multiplier, ladder_multipliers, ladder_tail_multiplier, round_ttl_seconds, daily_round_limit, cooldown_seconds, maintenance_mode, announcement",
        )
        .eq("status", "active")
        .maybeSingle(),
      db
        .from("arcade_treasure_configurations")
        .select(
          "id, difficulty, label, version, status, grid_rows, grid_cols, trap_count, target_rtp, min_stake, max_stake, max_return, max_multiplier, round_timeout_seconds, daily_round_limit, cooldown_seconds, maintenance_mode",
        )
        .eq("status", "active")
        .order("difficulty"),
      db
        .from("arcade_bj_rule_configs")
        .select("*")
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("arcade_bj_score_configs")
        .select("*")
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("arcade_score_profiles")
        .select("id, rows, risk_mode, version, status")
        .eq("status", "active")
        .order("rows"),
    ]);

    return {
      roulette: (roulette.data ?? null) as any,
      rps: (rps.data ?? null) as any,
      treasure: (treasure.data ?? []) as any[],
      blackjackRules: (bjRules.data ?? null) as any,
      blackjackScores: (bjScores.data ?? null) as any,
      plinkoProfiles: (plinko.data ?? []) as any[],
    };
  });

const patchSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]));

/** Publish a new versioned config for roulette / rps / treasure. */
export const arcadeAdminPublishConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        game: z.enum(["roulette", "rps", "treasure"]),
        difficulty: z.string().trim().min(1).max(32).optional(),
        patch: patchSchema,
        reason: z.string().trim().min(4).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertStaff(context, { write: true });
    if (data.game === "treasure") {
      if (!data.difficulty) throw new Error("Difficulty required");
      const { error } = await db.rpc("arcade_publish_treasure_config", {
        p_admin: context.userId,
        p_difficulty: data.difficulty,
        p_patch: data.patch,
        p_reason: data.reason,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const fn =
      data.game === "roulette" ? "arcade_publish_roulette_config" : "arcade_publish_rps_config";
    const { error } = await db.rpc(fn, {
      p_admin: context.userId,
      p_patch: data.patch,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recent rounds for one game, with player names — used by the per-game tabs. */
export const arcadeAdminRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        game: z.enum(["plinko", "roulette", "treasure", "blackjack", "rps"]),
        limit: z.number().int().min(10).max(200).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertStaff(context);
    const spec: Record<string, { table: string; cols: string; stake: string; payout: string; result: string }> = {
      plinko: {
        table: "arcade_plinko_games",
        cols: "id, user_id, stake_per_ball, payout, multiplier, outcome, created_at",
        stake: "stake_per_ball",
        payout: "payout",
        result: "outcome",
      },
      roulette: {
        table: "arcade_roulette_spins",
        cols: "id, user_id, total_stake, total_return, winning_pocket, status, created_at",
        stake: "total_stake",
        payout: "total_return",
        result: "status",
      },
      treasure: {
        table: "arcade_treasure_rounds",
        cols: "id, user_id, stake, gross_return, difficulty, final_multiplier, status, created_at",
        stake: "stake",
        payout: "gross_return",
        result: "status",
      },
      blackjack: {
        table: "arcade_bj_hands",
        cols: "id, user_id, total_stake, total_payout, result, status, created_at",
        stake: "total_stake",
        payout: "total_payout",
        result: "result",
      },
      rps: {
        table: "arcade_rps_rounds",
        cols: "id, user_id, stake, gross_return, multiplier, ladder_step, outcome, status, created_at",
        stake: "stake",
        payout: "gross_return",
        result: "outcome",
      },
    };
    const s = spec[data.game]!;
    const { data: rows, error } = await db
      .from(s.table)
      .select(s.cols)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      userId: String(r.user_id),
      username: nameOf.get(r.user_id) ?? null,
      stake: Number(r[s.stake] ?? 0),
      payout: Number(r[s.payout] ?? 0),
      result: (r[s.result] ?? r.status ?? null) as string | null,
      createdAt: String(r.created_at),
      raw: r,
    }));
  });

/** CSSE Originals mini-engine products (single `arcade_mini_rounds` table). */
export const MINI_PRODUCTS = [
  "hilo",
  "dice",
  "wheel",
  "keno",
  "crash",
  "towers",
  "poker",
] as const;
export type MiniAdminProduct = (typeof MINI_PRODUCTS)[number];

export type MiniAdminStats = {
  product: MiniAdminProduct;
  liveRounds: number;
  livePlayers: number;
  liveStake: number;
  rounds: number;
  players: number;
  staked: number;
  paid: number;
  houseNet: number;
  margin: number | null;
};

/**
 * Live + windowed performance and published config for every mini-engine
 * product, plus the most recent rounds across all of them.
 */
export const miniAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ windowHours: z.number().int().min(1).max(720).default(24) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await assertStaff(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    const [{ data: liveRows }, { data: windowRows }, { data: configRows }, { data: recentRows }] =
      await Promise.all([
        db
          .from("arcade_mini_rounds")
          .select("product, user_id, stake")
          .eq("status", "ACTIVE")
          .limit(1000),
        db
          .from("arcade_mini_rounds")
          .select("product, user_id, stake, gross_return, status")
          .gte("created_at", since)
          .limit(1000),
        db
          .from("arcade_mini_configs")
          .select(
            "id, product, version, status, min_stake, max_stake, target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, cooldown_seconds, maintenance_mode, announcement",
          )
          .eq("status", "active"),
        db
          .from("arcade_mini_rounds")
          .select(
            "id, product, user_id, stake, gross_return, multiplier, outcome, status, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

    const stats = new Map<string, MiniAdminStats>();
    const livePlayers = new Map<string, Set<string>>();
    const players = new Map<string, Set<string>>();
    for (const p of MINI_PRODUCTS) {
      stats.set(p, {
        product: p,
        liveRounds: 0,
        livePlayers: 0,
        liveStake: 0,
        rounds: 0,
        players: 0,
        staked: 0,
        paid: 0,
        houseNet: 0,
        margin: null,
      });
      livePlayers.set(p, new Set());
      players.set(p, new Set());
    }

    for (const r of (liveRows ?? []) as any[]) {
      const s = stats.get(r.product);
      if (!s) continue;
      s.liveRounds += 1;
      s.liveStake += Number(r.stake ?? 0);
      livePlayers.get(r.product)!.add(String(r.user_id));
    }
    for (const r of (windowRows ?? []) as any[]) {
      const s = stats.get(r.product);
      if (!s) continue;
      s.rounds += 1;
      s.staked += Number(r.stake ?? 0);
      s.paid += Number(r.gross_return ?? 0);
      players.get(r.product)!.add(String(r.user_id));
    }
    for (const s of stats.values()) {
      s.livePlayers = livePlayers.get(s.product)!.size;
      s.players = players.get(s.product)!.size;
      s.houseNet = Math.round((s.staked - s.paid) * 100) / 100;
      s.margin = s.staked > 0 ? s.houseNet / s.staked : null;
    }

    const ids = Array.from(new Set((recentRows ?? []).map((r: any) => r.user_id)));
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    return {
      windowHours: data.windowHours,
      generatedAt: new Date().toISOString(),
      stats: Array.from(stats.values()),
      configs: (configRows ?? []) as any[],
      recent: ((recentRows ?? []) as any[]).map((r) => ({
        id: String(r.id),
        product: String(r.product) as MiniAdminProduct,
        userId: String(r.user_id),
        username: nameOf.get(r.user_id) ?? null,
        stake: Number(r.stake ?? 0),
        payout: Number(r.gross_return ?? 0),
        multiplier: Number(r.multiplier ?? 0),
        result: (r.outcome ?? r.status ?? null) as string | null,
        createdAt: String(r.created_at),
      })),
    };
  });

/** Publish a new versioned config for one mini-engine product. */
export const miniAdminPublishConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        product: z.enum(MINI_PRODUCTS),
        patch: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
        reason: z.string().trim().min(4).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertStaff(context, { write: true });
    const { error } = await db.rpc("arcade_publish_mini_config", {
      p_admin: context.userId,
      p_product: data.product,
      p_patch: data.patch,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
