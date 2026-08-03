import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

const BetSchema = z.object({
  bet_type: z.string().trim().min(2).max(24),
  label: z.string().trim().min(1).max(48),
  pockets: z.array(z.number().int().min(0).max(36)).min(1).max(18),
  stake: z.number().positive().max(100000),
});

export const getRouletteConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("arcade_roulette_configurations")
      .select(
        "id, version, wheel_order, red_pockets, black_pockets, chip_values, min_total_stake, max_total_stake, max_stake_per_position, max_positions, daily_spin_limit, cooldown_seconds, maintenance_mode, announcement",
      )
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Roulette is not configured yet.");
    return { config: data };
  });

export const getRouletteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [walletRes, todayRes, allRes, recentRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("arcade_roulette_spins")
        .select("total_stake, total_return, user_net, status")
        .eq("user_id", userId)
        .gte("created_at", startOfDay),
      supabase
        .from("arcade_roulette_spins")
        .select("status, user_net")
        .eq("user_id", userId),
      supabase
        .from("arcade_roulette_spins")
        .select("id, winning_pocket, winning_colour, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const today = (todayRes.data ?? []) as any[];
    const all = (allRes.data ?? []) as any[];
    const count = (rows: any[], s: string) => rows.filter((r) => r.status === s).length;

    return {
      balance: Number(walletRes.data?.balance ?? 0),
      todayNet: today.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      todayStaked: today.reduce((a, r) => a + Number(r.total_stake ?? 0), 0),
      todayReturned: today.reduce((a, r) => a + Number(r.total_return ?? 0), 0),
      todaySpins: today.length,
      totalSpins: all.length,
      totalWins: count(all, "WIN"),
      totalLosses: count(all, "LOSS"),
      totalPushes: count(all, "PUSH"),
      lifetimeNet: all.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      recent: (recentRes.data ?? []) as any[],
    };
  });

export const placeRouletteSpin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        bets: z.array(BetSchema).min(1).max(30),
        clientSeed: z.string().trim().min(4).max(128),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      await enforceRateLimit(`roulette:${userId}`, "arcade_spin");
    } catch (e) {
      if ((e as Error).message === "RATE_LIMITED") {
        throw new Error("Too many spins — please slow down.");
      }
      throw e;
    }

    // Server-side coverage validation (client multipliers are never trusted).
    for (const b of data.bets) {
      const unique = new Set(b.pockets);
      if (unique.size !== b.pockets.length) throw new Error("Invalid bet coverage.");
      if (![1, 2, 3, 4, 6, 12, 18].includes(unique.size)) throw new Error("Invalid bet coverage.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: spin, error } = await (supabaseAdmin as any).rpc("arcade_place_roulette_spin", {
      p_user: userId,
      p_idempotency_key: data.idempotencyKey,
      p_client_seed: data.clientSeed,
      p_bets: data.bets.map((b) => ({
        bet_type: b.bet_type,
        label: b.label,
        pockets: b.pockets,
        stake: b.stake,
      })),
    });

    if (error) {
      const m = error.message || "";
      if (m.includes("INSUFFICIENT_BALANCE")) throw new Error("Not enough points in your wallet.");
      if (m.includes("BELOW_MIN_STAKE")) throw new Error("Total stake is below the minimum.");
      if (m.includes("ABOVE_MAX_STAKE")) throw new Error("Total stake is above the maximum.");
      if (m.includes("POSITION_LIMIT")) throw new Error("A position exceeds the maximum stake.");
      if (m.includes("TOO_MANY_POSITIONS")) throw new Error("Too many bet positions.");
      if (m.includes("DAILY_LIMIT")) throw new Error("You've reached today's spin limit.");
      if (m.includes("MAINTENANCE_MODE")) throw new Error("Roulette is under maintenance.");
      if (m.includes("INVALID")) throw new Error("Invalid bet — please rebuild your slip.");
      throw new Error(m || "Spin failed");
    }

    const { data: bets } = await (supabaseAdmin as any)
      .from("arcade_roulette_bets")
      .select("*")
      .eq("spin_id", spin.id);

    return { spin, bets: bets ?? [] };
  });

export const getRouletteHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
        status: z.enum(["ALL", "WIN", "LOSS", "PUSH", "VOID", "REVERSED"]).default("ALL"),
        sinceDays: z.number().int().min(0).max(3650).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("arcade_roulette_spins")
      .select(
        "id, created_at, winning_pocket, winning_colour, total_stake, total_return, user_net, status, position_count, verification_id, config_version",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status !== "ALL") q = q.eq("status", data.status as any);
    if (data.sinceDays > 0) {
      q = q.gte("created_at", new Date(Date.now() - data.sinceDays * 86400000).toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { spins: rows ?? [] };
  });

export const getRouletteSpin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: spin, error } = await supabase
      .from("arcade_roulette_spins")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!spin) throw new Error("NOT_FOUND");
    const { data: bets } = await supabase
      .from("arcade_roulette_bets")
      .select("*")
      .eq("spin_id", data.id)
      .order("created_at", { ascending: true });
    return { spin, bets: bets ?? [] };
  });
