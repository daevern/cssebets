import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read-only personal bests, computed from the caller's own round history.
 *
 * Backward-looking flavour text only — nothing here touches RNG, payouts,
 * limits or settlement, and no other player's data is ever read.
 */

const GameEnum = z.enum(["plinko", "roulette", "treasure", "blackjack", "rps"]);

export const getArcadePersonalBest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ game: GameEnum }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const max = (rows: any[] | null | undefined, key: string) =>
      (rows ?? []).reduce((m, r) => Math.max(m, Number(r[key] ?? 0)), 0);

    if (data.game === "plinko") {
      const { data: rows } = await supabase
        .from("arcade_plinko_games")
        .select("multiplier")
        .eq("user_id", userId)
        .order("multiplier", { ascending: false })
        .limit(1);
      return { label: "Highest multiplier", value: max(rows, "multiplier"), unit: "x" as const };
    }

    if (data.game === "roulette") {
      const { data: rows } = await supabase
        .from("arcade_roulette_spins")
        .select("total_return")
        .eq("user_id", userId)
        .order("total_return", { ascending: false })
        .limit(1);
      return { label: "Biggest single hit", value: max(rows, "total_return"), unit: "pts" as const };
    }

    if (data.game === "treasure") {
      const { data: rows } = await supabase
        .from("arcade_treasure_rounds")
        .select("safe_reveals")
        .eq("user_id", userId)
        .order("safe_reveals", { ascending: false })
        .limit(1);
      return { label: "Deepest dig", value: max(rows, "safe_reveals"), unit: "tiles" as const };
    }

    if (data.game === "rps") {
      const { data: rows } = await supabase
        .from("arcade_rps_rounds")
        .select("ladder_step")
        .eq("user_id", userId)
        .order("ladder_step", { ascending: false })
        .limit(1);
      return { label: "Longest streak", value: max(rows, "ladder_step"), unit: "wins" as const };
    }

    const { count } = await supabase
      .from("arcade_bj_hands")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("result", "BLACKJACK");
    return { label: "Best hand", value: Number(count ?? 0), unit: "blackjacks" as const };
  });
