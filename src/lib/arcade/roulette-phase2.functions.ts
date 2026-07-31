import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------- Provably-fair reveal ------------------------- */

export const revealRouletteSeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: spin, error } = await supabase
      .from("arcade_roulette_spins")
      .select(
        "id, seed_id, nonce, client_seed, server_seed_hash, random_hex, winning_pocket, winning_colour, verification_id, config_version",
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!spin) throw new Error("NOT_FOUND");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: seed, error: seedErr } = await (supabaseAdmin as any)
      .from("arcade_randomness_seeds")
      .select("server_seed, server_seed_hash, status")
      .eq("id", (spin as any).seed_id)
      .maybeSingle();
    if (seedErr) throw new Error(seedErr.message);
    if (!seed) throw new Error("SEED_NOT_FOUND");

    return {
      spinId: spin.id as string,
      serverSeed: seed.server_seed as string,
      serverSeedHash: (spin as any).server_seed_hash as string,
      clientSeed: (spin as any).client_seed as string,
      nonce: (spin as any).nonce as number,
      randomHex: (spin as any).random_hex as string,
      winningPocket: Number((spin as any).winning_pocket),
      winningColour: (spin as any).winning_colour as string,
      verificationId: (spin as any).verification_id as string,
      configVersion: Number((spin as any).config_version ?? 0),
    };
  });

/* ----------------------------- Statistics ----------------------------- */

export const getRouletteStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [spinsRes, betsRes] = await Promise.all([
      supabase
        .from("arcade_roulette_spins")
        .select(
          "id, created_at, winning_pocket, winning_colour, total_stake, total_return, user_net, status, position_count",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("arcade_roulette_bets")
        .select("bet_type, covered_count, stake, gross_return, net_result, is_win")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const spins = (spinsRes.data ?? []) as any[];
    const bets = (betsRes.data ?? []) as any[];

    const staked = spins.reduce((a, s) => a + Number(s.total_stake ?? 0), 0);
    const returned = spins.reduce((a, s) => a + Number(s.total_return ?? 0), 0);
    const net = returned - staked;
    const wins = spins.filter((s) => s.status === "WIN").length;
    const losses = spins.filter((s) => s.status === "LOSS").length;
    const pushes = spins.filter((s) => s.status === "PUSH").length;

    const pocketCounts = Array.from({ length: 13 }, (_, n) => ({
      pocket: n,
      count: spins.filter((s) => Number(s.winning_pocket) === n).length,
    }));

    const colourCounts = ["green", "red", "black"].map((c) => ({
      colour: c,
      count: spins.filter((s) => s.winning_colour === c).length,
    }));

    const byType: Record<
      string,
      { bets: number; staked: number; returned: number; wins: number }
    > = {};
    for (const b of bets) {
      const k = b.bet_type ?? "custom";
      byType[k] ??= { bets: 0, staked: 0, returned: 0, wins: 0 };
      byType[k].bets += 1;
      byType[k].staked += Number(b.stake ?? 0);
      byType[k].returned += Number(b.gross_return ?? 0);
      if (b.is_win) byType[k].wins += 1;
    }

    // Running net over the last 60 spins (oldest → newest).
    const seq = spins.slice(0, 60).reverse();
    let run = 0;
    const curve = seq.map((s, i) => {
      run += Number(s.user_net ?? 0);
      return { i, net: Math.round(run * 100) / 100 };
    });

    let bestWin = 0;
    let worstLoss = 0;
    for (const s of spins) {
      const n = Number(s.user_net ?? 0);
      if (n > bestWin) bestWin = n;
      if (n < worstLoss) worstLoss = n;
    }

    let streak = 0;
    for (const s of spins) {
      if (s.status === "WIN") streak += 1;
      else break;
    }

    return {
      totalSpins: spins.length,
      staked: Math.round(staked * 100) / 100,
      returned: Math.round(returned * 100) / 100,
      net: Math.round(net * 100) / 100,
      actualRtp: staked > 0 ? Math.round((returned / staked) * 10000) / 100 : 0,
      wins,
      losses,
      pushes,
      winRate: spins.length ? Math.round((wins / spins.length) * 1000) / 10 : 0,
      bestWin: Math.round(bestWin * 100) / 100,
      worstLoss: Math.round(worstLoss * 100) / 100,
      currentWinStreak: streak,
      pocketCounts,
      colourCounts,
      byType: Object.entries(byType).map(([bet_type, v]) => ({
        bet_type,
        ...v,
        staked: Math.round(v.staked * 100) / 100,
        returned: Math.round(v.returned * 100) / 100,
        rtp: v.staked ? Math.round((v.returned / v.staked) * 10000) / 100 : 0,
      })),
      curve,
      lastSpinAt: (spins[0]?.created_at as string | undefined) ?? null,
    };
  });

/* ------------------------- Cooldown / limits ------------------------- */

export const getRouletteSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [cfgRes, lastRes, todayRes] = await Promise.all([
      supabase
        .from("arcade_roulette_configurations")
        .select("cooldown_seconds, daily_spin_limit, maintenance_mode, version")
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("arcade_roulette_spins")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("arcade_roulette_spins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfDay),
    ]);

    const cooldownSeconds = Number((cfgRes.data as any)?.cooldown_seconds ?? 0);
    const lastAt = (lastRes.data as any)?.created_at as string | undefined;
    const elapsed = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 1000 : Infinity;

    return {
      cooldownSeconds,
      cooldownRemaining: Math.max(0, Math.ceil(cooldownSeconds - elapsed)),
      dailySpinLimit: Number((cfgRes.data as any)?.daily_spin_limit ?? 0),
      spinsToday: todayRes.count ?? 0,
      maintenanceMode: Boolean((cfgRes.data as any)?.maintenance_mode),
      configVersion: Number((cfgRes.data as any)?.version ?? 0),
      lastSpinAt: lastAt ?? null,
    };
  });
