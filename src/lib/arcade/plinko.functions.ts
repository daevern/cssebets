import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

const RiskEnum = z.enum(["low", "medium", "high"]);
const RowsEnum = z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(14), z.literal(16)]);
const StakeSchema = z.number().min(1).max(100);

export const getPlinkoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: profiles } = await supabase
      .from("arcade_score_profiles")
      .select("id, rows, risk_mode, version, status, arcade_score_profile_slots(slot_index, score, multiplier)")
      .eq("status", "active");
    const shaped = (profiles ?? []).map((p: any) => ({
      id: p.id,
      rows: p.rows,
      risk_mode: p.risk_mode,
      version: p.version,
      slots: (p.arcade_score_profile_slots ?? [])
        .sort((a: any, b: any) => a.slot_index - b.slot_index)
        .map((s: any) => ({
          slot_index: s.slot_index,
          score: s.score,
          multiplier: Number(s.multiplier ?? 0),
        })),
    }));
    return {
      minStake: 1,
      maxStake: 100,
      maxBallsPerBatch: 10,
      supportedRows: [8, 10, 12, 14, 16] as const,
      supportedRisks: ["low", "medium", "high"] as const,
      profiles: shaped,
    };
  });

export const getPlinkoProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure wallet exists (defensive; handle_new_user should create it).
    await (supabaseAdmin as any)
      .from("wallets")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

    const [walletRes, todayRes, lifetimeRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase
        .from("arcade_plinko_games")
        .select("payout, stake_per_ball, multiplier")
        .eq("user_id", userId)
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabase
        .from("arcade_plinko_games")
        .select("payout, stake_per_ball, multiplier")
        .eq("user_id", userId),
    ]);

    const sum = (arr: any[], key: string) => arr.reduce((a, r) => a + Number(r[key] ?? 0), 0);
    const bestMult = (arr: any[]) =>
      arr.length ? arr.reduce((m, r) => Math.max(m, Number(r.multiplier ?? 0)), 0) : 0;

    const today = todayRes.data ?? [];
    const all = lifetimeRes.data ?? [];

    return {
      balance: Number(walletRes.data?.balance ?? 0),
      todayWagered: sum(today, "stake_per_ball"),
      todayPayout: sum(today, "payout"),
      todayBestMult: bestMult(today),
      lifetimeBestMult: bestMult(all),
      totalDrops: all.length,
    };
  });

export const placePlinkoDrop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        rows: RowsEnum,
        riskMode: RiskEnum,
        stakePerBall: StakeSchema,
        clientSeed: z.string().trim().min(4).max(128),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      await enforceRateLimit(`plinko:${userId}`, "arcade_drop");
    } catch (e) {
      if ((e as Error).message === "RATE_LIMITED") {
        throw new Error("Too many drops — please slow down.");
      }
      throw e;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: game, error } = await (supabaseAdmin as any).rpc("arcade_place_plinko_drop", {
      p_user: userId,
      p_rows: data.rows,
      p_risk: data.riskMode,
      p_idempotency_key: data.idempotencyKey,
      p_client_seed: data.clientSeed,
      p_stake: data.stakePerBall,
    });
    if (error) {
      const m = error.message || "";
      if (m.includes("INSUFFICIENT_BALANCE")) throw new Error("Not enough points in your wallet.");
      if (m.includes("INVALID_STAKE")) throw new Error("Stake must be between 1 and 100 points.");
      if (m.includes("NO_ACTIVE_PROFILE")) throw new Error("Scoring temporarily unavailable.");
      if (m.includes("EXPOSURE_LIMIT"))
        throw new Error("Stake too large right now — the house reserve can't cover the top prize on this board. Try a smaller stake.");
      throw new Error(m || "Drop failed");
    }
    return { game };
  });

export const getPlinkoHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).max(10000).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("arcade_plinko_games")
      .select(
        "id, rows, risk_mode, landing_slot, score, outcome, score_band, drop_type, verification_id, created_at, stake_per_ball, multiplier, payout",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { games: rows ?? [] };
  });

export const getPlinkoResult = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("arcade_plinko_games")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("NOT_FOUND");
    return { game: row };
  });
