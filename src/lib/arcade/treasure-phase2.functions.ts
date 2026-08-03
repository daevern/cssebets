import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Treasure Grid — reveal, statistics and leaderboards.
 * Nothing here mutates game or wallet state.
 */

const PERIOD_MS: Record<string, number | null> = {
  daily: 86400_000,
  weekly: 7 * 86400_000,
  monthly: 30 * 86400_000,
  all: null,
};

/* ------------------------- Provably-fair reveal ------------------------- */

export const revealTreasureSeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: round, error } = await supabase
      .from("arcade_treasure_rounds")
      .select(
        "id, status, seed_id, nonce, client_seed, server_seed_hash, verification_id, difficulty, " +
          "grid_rows, grid_cols, trap_count, safe_reveals, selected_trap_index, final_multiplier, " +
          "current_multiplier, config_version, rtp_version, settled_at",
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!round) throw new Error("Round not found.");

    const settled = !["CREATED", "ACTIVE", "COLLECTING"].includes((round as any).status);
    if (!settled) throw new Error("Finish or collect this round before revealing the server seed.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [seedRes, tilesRes, actionsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("arcade_randomness_seeds")
        .select("server_seed, server_seed_hash")
        .eq("id", (round as any).seed_id)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("arcade_treasure_tiles")
        .select("tile_index, tile_type")
        .eq("round_id", (round as any).id)
        .eq("tile_type", "TRAP"),
      supabase
        .from("arcade_treasure_round_actions")
        .select("action_sequence, action_type, tile_index, outcome, multiplier_after")
        .eq("round_id", (round as any).id)
        .order("action_sequence", { ascending: true }),
    ]);

    if (seedRes.error) throw new Error(seedRes.error.message);
    if (!seedRes.data) throw new Error("Seed not found.");

    return {
      roundId: (round as any).id as string,
      status: (round as any).status as string,
      difficulty: (round as any).difficulty as string,
      gridRows: Number((round as any).grid_rows),
      gridCols: Number((round as any).grid_cols),
      trapCount: Number((round as any).trap_count),
      safeReveals: Number((round as any).safe_reveals ?? 0),
      selectedTrapIndex:
        (round as any).selected_trap_index === null
          ? null
          : Number((round as any).selected_trap_index),
      finalMultiplier: Number(
        (round as any).final_multiplier ?? (round as any).current_multiplier ?? 1,
      ),
      serverSeed: seedRes.data.server_seed as string,
      serverSeedHash: (round as any).server_seed_hash as string,
      clientSeed: (round as any).client_seed as string,
      nonce: Number((round as any).nonce),
      verificationId: (round as any).verification_id as string,
      configVersion: Number((round as any).config_version ?? 0),
      rtpVersion: Number((round as any).rtp_version ?? 0),
      trapIndices: ((tilesRes.data?.trap_indices ?? []) as number[]).map(Number),
      actions: (actionsRes.data ?? []) as any[],
    };
  });

/* ----------------------------- Statistics ----------------------------- */

export const getTreasureStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("arcade_treasure_rounds")
      .select(
        "id, created_at, difficulty, status, stake, gross_return, user_net, safe_reveals, final_multiplier, current_multiplier",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rounds = (data ?? []) as any[];
    const settled = rounds.filter((r) => !["CREATED", "ACTIVE", "COLLECTING"].includes(r.status));

    const staked = settled.reduce((a, r) => a + Number(r.stake ?? 0), 0);
    const returned = settled.reduce((a, r) => a + Number(r.gross_return ?? 0), 0);
    const wins = settled.filter((r) => r.status === "WON").length;
    const losses = settled.filter((r) => r.status === "LOST").length;

    const byDifficulty: Record<
      string,
      { rounds: number; staked: number; returned: number; wins: number; bestMultiplier: number }
    > = {};
    for (const r of settled) {
      const k = r.difficulty ?? "unknown";
      byDifficulty[k] ??= { rounds: 0, staked: 0, returned: 0, wins: 0, bestMultiplier: 0 };
      const b = byDifficulty[k];
      b.rounds += 1;
      b.staked += Number(r.stake ?? 0);
      b.returned += Number(r.gross_return ?? 0);
      if (r.status === "WON") b.wins += 1;
      const m = Number(r.final_multiplier ?? r.current_multiplier ?? 0);
      if (r.status === "WON" && m > b.bestMultiplier) b.bestMultiplier = m;
    }

    const seq = settled.slice(0, 60).reverse();
    let run = 0;
    const curve = seq.map((r, i) => {
      run += Number(r.user_net ?? 0);
      return { i, net: Math.round(run * 100) / 100 };
    });

    let bestWin = 0;
    let worstLoss = 0;
    let bestMultiplier = 0;
    let bestSafeStreak = 0;
    for (const r of settled) {
      const n = Number(r.user_net ?? 0);
      if (n > bestWin) bestWin = n;
      if (n < worstLoss) worstLoss = n;
      const m = Number(r.final_multiplier ?? r.current_multiplier ?? 0);
      if (r.status === "WON" && m > bestMultiplier) bestMultiplier = m;
      const s = Number(r.safe_reveals ?? 0);
      if (s > bestSafeStreak) bestSafeStreak = s;
    }

    let winStreak = 0;
    for (const r of settled) {
      if (r.status === "WON") winStreak += 1;
      else break;
    }

    return {
      totalRounds: settled.length,
      staked,
      returned,
      net: returned - staked,
      actualRtp: staked > 0 ? Math.round((returned / staked) * 10000) / 100 : 0,
      wins,
      losses,
      winRate: settled.length ? Math.round((wins / settled.length) * 1000) / 10 : 0,
      bestWin,
      worstLoss,
      bestMultiplier: Math.round(bestMultiplier * 100) / 100,
      bestSafeStreak,
      currentWinStreak: winStreak,
      avgSafeReveals: settled.length
        ? Math.round(
            (settled.reduce((a, r) => a + Number(r.safe_reveals ?? 0), 0) / settled.length) * 10,
          ) / 10
        : 0,
      byDifficulty: Object.entries(byDifficulty).map(([difficulty, v]) => ({
        difficulty,
        ...v,
        rtp: v.staked ? Math.round((v.returned / v.staked) * 10000) / 100 : 0,
        bestMultiplier: Math.round(v.bestMultiplier * 100) / 100,
      })),
      curve,
      lastRoundAt: (settled[0]?.created_at as string | undefined) ?? null,
    };
  });

/* ----------------------------- Leaderboard ----------------------------- */

export const getTreasureLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        period: z.enum(["daily", "weekly", "monthly", "all"]).default("weekly"),
        metric: z.enum(["net", "multiplier"]).default("net"),
        limit: z.number().int().min(5).max(50).default(25),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin as any)
      .from("arcade_treasure_rounds")
      .select("user_id, user_net, status, final_multiplier, safe_reveals, created_at")
      .in("status", ["WON", "LOST"])
      .limit(20000);

    const windowMs = PERIOD_MS[data.period];
    if (windowMs) query = query.gte("created_at", new Date(Date.now() - windowMs).toISOString());

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const agg: Record<string, { rounds: number; net: number; best: number; safe: number }> = {};
    for (const r of (rows ?? []) as any[]) {
      agg[r.user_id] ??= { rounds: 0, net: 0, best: 0, safe: 0 };
      const a = agg[r.user_id];
      a.rounds += 1;
      a.net += Number(r.user_net ?? 0);
      if (r.status === "WON") a.best = Math.max(a.best, Number(r.final_multiplier ?? 0));
      a.safe = Math.max(a.safe, Number(r.safe_reveals ?? 0));
    }

    const ids = Object.keys(agg);
    const { data: profiles } = ids.length
      ? await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = (id: string) => {
      const p = (profiles ?? []).find((x: any) => x.id === id);
      return (p?.display_name as string) || `Player ${id.slice(0, 6)}`;
    };

    const ranked = ids
      .map((id) => ({
        user_id: id,
        name: nameOf(id),
        rounds: agg[id].rounds,
        net: Math.round(agg[id].net * 100) / 100,
        bestMultiplier: Math.round(agg[id].best * 100) / 100,
        bestSafeStreak: agg[id].safe,
        isMe: id === userId,
      }))
      .sort((a, b) => (data.metric === "net" ? b.net - a.net : b.bestMultiplier - a.bestMultiplier))
      .map((row, i) => ({ ...row, rank: i + 1 }));

    return {
      period: data.period,
      metric: data.metric,
      leaderboard: ranked.slice(0, data.limit),
      myRank: ranked.find((r) => r.isMe)?.rank ?? null,
    };
  });
