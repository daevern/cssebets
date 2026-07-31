import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Blackjack — verification, history and statistics (score only, no money).
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Reveals the shoe seed for a settled hand so the shuffle can be recomputed. */
export const revealBlackjackShoe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ handId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: res, error } = await db.rpc("arcade_bj_reveal_shoe", {
      p_user: context.userId,
      p_hand: data.handId,
    });
    if (error) {
      const m = error.message || "";
      if (m.includes("HAND_NOT_SETTLED")) throw new Error("You can verify a hand once it's settled.");
      if (m.includes("HAND_NOT_FOUND")) throw new Error("Hand not found.");
      throw new Error(m);
    }
    return res as {
      serverSeed: string;
      serverSeedHash: string;
      clientSeed: string;
      nonce: number;
      deckCount: number;
      totalCards: number;
      cardOrder: number[];
      cards: { owner: string; rank: number; suit: number; position: number; sequence: number }[];
    };
  });

/** Paginated hand history for the signed-in player. */
export const getBlackjackHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(500).default(0),
        pageSize: z.number().int().min(5).max(50).default(20),
        result: z
          .enum(["ALL", "BLACKJACK", "WIN", "LOSS", "PUSH", "BUST", "MIXED", "VOID"])
          .default("ALL"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.page * data.pageSize;
    let q = supabase
      .from("arcade_bj_hands")
      .select("id, status, result, total_score_awarded, dealer_total, created_at, settled_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (data.result !== "ALL") q = q.eq("result", data.result);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[], total: count ?? 0 };
  });

/** Lifetime + rolling statistics for the signed-in player. */
export const getBlackjackStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("arcade_bj_hands")
      .select("result, total_score_awarded, created_at")
      .eq("user_id", userId)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const hands = (rows ?? []) as any[];
    const counts: Record<string, number> = {};
    let score = 0;
    for (const h of hands) {
      counts[h.result ?? "UNKNOWN"] = (counts[h.result ?? "UNKNOWN"] ?? 0) + 1;
      score += Number(h.total_score_awarded ?? 0);
    }

    // running score, oldest → newest, for the chart
    const chrono = [...hands].reverse();
    let running = 0;
    const curve = chrono.map((h, i) => {
      running += Number(h.total_score_awarded ?? 0);
      return { i, score: running };
    });

    let best = 0;
    let cur = 0;
    for (const h of chrono) {
      if (h.result === "WIN" || h.result === "BLACKJACK") {
        cur += 1;
        best = Math.max(best, cur);
      } else if (h.result !== "PUSH") {
        cur = 0;
      }
    }

    const wins = (counts.WIN ?? 0) + (counts.BLACKJACK ?? 0);
    return {
      hands: hands.length,
      counts,
      score,
      avgScore: hands.length ? Number((score / hands.length).toFixed(1)) : 0,
      winRate: hands.length ? Number(((wins / hands.length) * 100).toFixed(1)) : 0,
      bestStreak: best,
      curve,
    };
  });
