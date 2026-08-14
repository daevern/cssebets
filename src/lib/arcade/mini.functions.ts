import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireApprovedMember } from "@/lib/access-control";

/**
 * CSSE Originals — Hi-Lo, Dice and Fortune Wheel.
 *
 * Every outcome is produced by a SECURITY DEFINER database function from a
 * server seed committed before the player acts. The browser may only send a
 * stake, a selection, a client seed and an idempotency key; there is no code
 * path that accepts a client-supplied roll, card, segment, multiplier,
 * payout or balance.
 */

const miniProduct = z.enum(["hilo", "dice", "wheel"]);

/** Stake bounds, chip denominations and published payout tables. */
export const getMiniConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ product: miniProduct }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("arcade_mini_configs")
      .select(
        "id, product, version, min_stake, max_stake, chip_values, target_rtp, max_multiplier, " +
          "daily_round_limit, maintenance_mode, announcement, payload",
      )
      .eq("product", data.product)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This table is not configured yet.");
    return { config: row as any };
  });

/** Wallet balance plus this cabinet's session and lifetime summary. */
export const getMiniProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ product: miniProduct }).parse(i))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [walletRes, todayRes, recentRes, bestRes] = await Promise.all([
      db.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      db
        .from("arcade_mini_rounds")
        .select("stake, gross_return, user_net, outcome, multiplier")
        .eq("user_id", userId)
        .eq("product", data.product)
        .eq("status", "SETTLED")
        .gte("created_at", startOfDay),
      db
        .from("arcade_mini_rounds")
        .select("id, outcome, stake, multiplier, user_net, settled_at, state")
        .eq("user_id", userId)
        .eq("product", data.product)
        .eq("status", "SETTLED")
        .order("settled_at", { ascending: false })
        .limit(15),
      db
        .from("arcade_mini_rounds")
        .select("multiplier")
        .eq("user_id", userId)
        .eq("product", data.product)
        .eq("status", "SETTLED")
        .order("multiplier", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const today = (todayRes.data ?? []) as any[];
    return {
      balance: Number(walletRes.data?.balance ?? 0),
      todayNet: today.reduce((a, r) => a + Number(r.user_net ?? 0), 0),
      todayStaked: today.reduce((a, r) => a + Number(r.stake ?? 0), 0),
      todayRounds: today.length,
      todayWins: today.filter((r) => r.outcome === "WIN").length,
      bestMultiplier: Number(bestRes.data?.multiplier ?? 0),
      recent: (recentRes.data ?? []).map((r: any) => ({
        id: r.id as string,
        outcome: r.outcome as string,
        stake: Number(r.stake ?? 0),
        multiplier: Number(r.multiplier ?? 0),
        userNet: Number(r.user_net ?? 0),
        settledAt: r.settled_at as string,
        state: (r.state ?? {}) as Record<string, any>,
      })),
    };
  });

/** One dice bet — staked, resolved and settled in a single transaction. */
export const playDice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        stake: z.number().positive(),
        target: z.number().min(2).max(98),
        direction: z.enum(["under", "over"]),
        clientSeed: z.string().min(4).max(128),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    const { enforceMiniRateLimit, mapMiniError, publicMiniRound } = await import(
      "@/lib/arcade/mini.server"
    );
    await enforceMiniRateLimit("dice", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_dice_play", {
      p_user: userId,
      p_stake: data.stake,
      p_target: data.target,
      p_direction: data.direction,
      p_client_seed: data.clientSeed,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapMiniError("dice", error.message));
    return { round: publicMiniRound(Array.isArray(row) ? row[0] : row) };
  });

/** One wheel spin. */
export const playWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        stake: z.number().positive(),
        risk: z.enum(["low", "medium", "high"]),
        clientSeed: z.string().min(4).max(128),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    const { enforceMiniRateLimit, mapMiniError, publicMiniRound } = await import(
      "@/lib/arcade/mini.server"
    );
    await enforceMiniRateLimit("wheel", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_wheel_play", {
      p_user: userId,
      p_stake: data.stake,
      p_risk: data.risk,
      p_client_seed: data.clientSeed,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapMiniError("wheel", error.message));
    return { round: publicMiniRound(Array.isArray(row) ? row[0] : row) };
  });

/** Opens a Hi-Lo run: stake leaves the wallet and the first card is dealt. */
export const startHilo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        stake: z.number().positive(),
        clientSeed: z.string().min(4).max(128),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    const { enforceMiniRateLimit, mapMiniError, publicMiniRound } = await import(
      "@/lib/arcade/mini.server"
    );
    await enforceMiniRateLimit("hilo", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_hilo_start", {
      p_user: userId,
      p_stake: data.stake,
      p_client_seed: data.clientSeed,
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(mapMiniError("hilo", error.message));
    return { round: publicMiniRound(Array.isArray(row) ? row[0] : row) };
  });

/** Calls higher or lower on the live Hi-Lo run. */
export const guessHilo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ roundId: z.string().uuid(), guess: z.enum(["higher", "lower"]) })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    const { mapMiniError, publicMiniRound } = await import("@/lib/arcade/mini.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_hilo_guess", {
      p_user: userId,
      p_round_id: data.roundId,
      p_guess: data.guess,
    });
    if (error) throw new Error(mapMiniError("hilo", error.message));
    return { round: publicMiniRound(Array.isArray(row) ? row[0] : row) };
  });

/** Banks the current Hi-Lo multiplier. */
export const cashoutHilo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ roundId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await requireApprovedMember(context);
    const { mapMiniError, publicMiniRound } = await import("@/lib/arcade/mini.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any).rpc("arcade_hilo_cashout", {
      p_user: userId,
      p_round_id: data.roundId,
    });
    if (error) throw new Error(mapMiniError("hilo", error.message));
    return { round: publicMiniRound(Array.isArray(row) ? row[0] : row) };
  });

/** Recovers an in-flight Hi-Lo run after a refresh or connection drop. */
export const getActiveHilo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { publicMiniRound } = await import("@/lib/arcade/mini.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("arcade_mini_rounds")
      .select("*")
      .eq("user_id", userId)
      .eq("product", "hilo")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { round: publicMiniRound(row) };
  });
