import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, isRateLimitError } from "@/lib/rate-limit.functions";

const RiskEnum = z.enum(["low", "medium", "high"]);
const RowsEnum = z.union([
  z.literal(8), z.literal(10), z.literal(12), z.literal(14), z.literal(16),
]);

/* ---------------------------- Batch drops ---------------------------- */

export const placePlinkoDropBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      rows: RowsEnum,
      riskMode: RiskEnum,
      stakePerBall: z.number().min(1).max(100),
      clientSeed: z.string().trim().min(4).max(128),
      batchKey: z.string().trim().min(8).max(64),
      count: z.number().int().min(2).max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      await enforceRateLimit(`plinko:${userId}`, "arcade_drop");
    } catch (e) {
      if (isRateLimitError(e)) {
        throw new Error("Too many drops — please slow down.");
      }
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-check wallet balance so we don't half-execute.
    const totalCost = Math.round(data.stakePerBall * data.count * 100) / 100;
    const { data: wallet } = await (supabaseAdmin as any)
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < totalCost) {
      throw new Error(`Not enough points. Need ${totalCost.toFixed(2)}, have ${balance.toFixed(2)}.`);
    }

    const games: any[] = [];
    for (let i = 0; i < data.count; i++) {
      const idempotencyKey = `${data.batchKey}-${i}`;
      const { data: g, error } = await (supabaseAdmin as any).rpc("arcade_place_plinko_drop", {
        p_user: userId,
        p_rows: data.rows,
        p_risk: data.riskMode,
        p_idempotency_key: idempotencyKey,
        p_client_seed: data.clientSeed,
        p_stake: data.stakePerBall,
      });
      if (error) {
        const m = error.message || "";
        if (m.includes("INSUFFICIENT_BALANCE")) break;
        if (games.length === 0) throw new Error(m || "Batch failed");
        break;
      }
      games.push(g);
    }
    return { games };
  });

/* --------------------------- Reveal / Verify --------------------------- */

export const revealPlinkoSeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // User-scoped: RLS ensures ownership.
    const { data: game, error: gameErr } = await supabase
      .from("arcade_plinko_games")
      .select("id, user_id, seed_id, nonce, client_seed, server_seed_hash, path, landing_slot, rows")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (gameErr) throw new Error(gameErr.message);
    if (!game) throw new Error("NOT_FOUND");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: seed, error: seedErr } = await (supabaseAdmin as any)
      .from("arcade_randomness_seeds")
      .select("server_seed, server_seed_hash")
      .eq("id", (game as any).seed_id)
      .maybeSingle();
    if (seedErr) throw new Error(seedErr.message);
    if (!seed) throw new Error("SEED_NOT_FOUND");

    return {
      gameId: game.id,
      serverSeed: seed.server_seed as string,
      serverSeedHash: seed.server_seed_hash as string,
      clientSeed: (game as any).client_seed as string,
      nonce: (game as any).nonce as number,
      rows: (game as any).rows as number,
      path: (game as any).path as number[],
      landingSlot: (game as any).landing_slot as number,
    };
  });

/* --------------------------- Statistics --------------------------- */

export const getPlinkoStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: games, error } = await supabase
      .from("arcade_plinko_games")
      .select("score, score_band, outcome, risk_mode, rows, landing_slot, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = games ?? [];

    const bandDist: Record<string, number> = {
      ZERO: 0, LOW: 0, STANDARD: 0, HIGH: 0, RARE: 0, JACKPOT: 0,
    };
    const byRisk: Record<string, { drops: number; total: number; best: number }> = {
      low: { drops: 0, total: 0, best: 0 },
      medium: { drops: 0, total: 0, best: 0 },
      high: { drops: 0, total: 0, best: 0 },
    };

    let totalScore = 0;
    let wins = 0;
    let best = 0;
    let longestStreak = 0;
    const chrono = [...rows].reverse();
    let running = 0;
    for (const r of chrono) {
      if (r.outcome === "WIN") {
        running += 1;
        longestStreak = Math.max(longestStreak, running);
      } else {
        running = 0;
      }
    }
    const currentStreak = running;

    for (const r of rows) {
      totalScore += r.score ?? 0;
      if (r.outcome === "WIN") wins += 1;
      best = Math.max(best, r.score ?? 0);
      bandDist[r.score_band as string] = (bandDist[r.score_band as string] ?? 0) + 1;
      const bucket = byRisk[r.risk_mode as string];
      if (bucket) {
        bucket.drops += 1;
        bucket.total += r.score ?? 0;
        bucket.best = Math.max(bucket.best, r.score ?? 0);
      }
    }

    const spark = chrono.slice(-40).map((r, i) => ({ i, score: r.score }));

    return {
      totalDrops: rows.length,
      totalScore,
      averageScore: rows.length ? Math.round(totalScore / rows.length) : 0,
      wins,
      winRate: rows.length ? Math.round((wins / rows.length) * 100) : 0,
      best,
      currentStreak,
      longestStreak,
      bandDistribution: Object.entries(bandDist).map(([band, count]) => ({ band, count })),
      byRisk,
      spark,
    };
  });

/* --------------------------- Leaderboards --------------------------- */

export const getPlinkoLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      period: z.enum(["daily", "weekly", "monthly", "all"]).default("weekly"),
      limit: z.number().int().min(1).max(50).default(25),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    let sinceIso: string | null = null;
    if (data.period === "daily") {
      sinceIso = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    } else if (data.period === "weekly") {
      const d = new Date();
      const day = d.getDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day; // start Monday
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      sinceIso = d.toISOString();
    } else if (data.period === "monthly") {
      const d = new Date();
      sinceIso = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    }

    let q = (supabaseAdmin as any).from("arcade_plinko_games").select("user_id, score");
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data: rows, error } = await q.limit(50000);
    if (error) throw new Error(error.message);

    const totals = new Map<string, { user_id: string; score: number; drops: number }>();
    for (const r of (rows ?? []) as any[]) {
      const cur = totals.get(r.user_id) ?? { user_id: r.user_id, score: 0, drops: 0 };
      cur.score += r.score ?? 0;
      cur.drops += 1;
      totals.set(r.user_id, cur);
    }
    const ranked = [...totals.values()].sort((a, b) => b.score - a.score).slice(0, data.limit);

    const ids = ranked.map((r) => r.user_id);
    const namesById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of (profs ?? []) as any[]) {
        namesById.set(p.id, p.display_name || "Player");
      }
    }

    const leaderboard = ranked.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      name: namesById.get(r.user_id) ?? "Player",
      score: r.score,
      drops: r.drops,
      isMe: r.user_id === userId,
    }));

    let myRank: number | null = null;
    if (!leaderboard.some((r) => r.isMe)) {
      const all = [...totals.values()].sort((a, b) => b.score - a.score);
      const idx = all.findIndex((r) => r.user_id === userId);
      if (idx >= 0) myRank = idx + 1;
    } else {
      myRank = leaderboard.find((r) => r.isMe)!.rank;
    }

    return { leaderboard, myRank, period: data.period };
  });

/* --------------------------- Challenges & Achievements --------------------------- */

export const getPlinkoChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: challenges, error } = await supabase
      .from("arcade_challenges")
      .select("id, code, name, description, period, metric, target_value, reward_bonus_drops, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: progress } = await supabase
      .from("arcade_challenge_progress")
      .select("challenge_id, period_bucket, progress, completed_at, reward_granted")
      .eq("user_id", userId);

    const now = new Date();
    const bucketFor = (period: string) => {
      if (period === "daily") return now.toISOString().slice(0, 10);
      if (period === "weekly") {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayNum = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const week =
          1 +
          Math.round(
            ((d.getTime() - firstThursday.getTime()) / 86400000 -
              3 +
              ((firstThursday.getUTCDay() + 6) % 7)) /
              7,
          );
        return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
      }
      return "all";
    };

    return {
      challenges: (challenges ?? []).map((c: any) => {
        const bucket = bucketFor(c.period);
        const p = (progress ?? []).find(
          (x: any) => x.challenge_id === c.id && x.period_bucket === bucket,
        );
        return {
          ...c,
          period_bucket: bucket,
          progress: Number(p?.progress ?? 0),
          completed_at: p?.completed_at ?? null,
          reward_granted: p?.reward_granted ?? false,
        };
      }),
    };
  });

export const getPlinkoAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: achievements, error } = await supabase
      .from("arcade_achievements")
      .select("id, code, name, description, tier, metric, target_value, reward_bonus_drops, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: unlocks } = await supabase
      .from("arcade_achievement_unlocks")
      .select("achievement_id, progress, unlocked_at")
      .eq("user_id", userId);

    return {
      achievements: (achievements ?? []).map((a: any) => {
        const u = (unlocks ?? []).find((x: any) => x.achievement_id === a.id);
        return {
          ...a,
          progress: Number(u?.progress ?? 0),
          unlocked_at: u?.unlocked_at ?? null,
        };
      }),
    };
  });
