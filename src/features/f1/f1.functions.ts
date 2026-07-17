// Client-callable server functions for the F1 feature.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

async function requireAdmin(sb: any, userId: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) throw new Error("Forbidden");
}

// ---------- Public reads ----------

export const listF1Races = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("f1_races")
      .select("id, race_key, season, round, name, circuit, country, starts_at, status")
      .order("starts_at", { ascending: true });
    return { races: data ?? [] };
  });

export const getF1Race = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ raceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ data: race }, { data: markets }] = await Promise.all([
      (context.supabase as any).from("f1_races").select("*").eq("id", data.raceId).maybeSingle(),
      (context.supabase as any)
        .from("f1_race_markets")
        .select("id, market_type, selection_key, secondary_selection_key, label, odds, status")
        .eq("race_id", data.raceId)
        .eq("status", "open")
        .order("market_type", { ascending: true })
        .order("odds", { ascending: true }),
    ]);
    if (!race) throw new Error("Race not found");
    return { race, markets: markets ?? [] };
  });

export const listF1ChampionshipMarkets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ season: z.number().int() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows } = await (context.supabase as any)
      .from("f1_championship_markets")
      .select("id, season, market_type, selection_key, label, odds, status")
      .eq("season", data.season)
      .eq("status", "open")
      .order("odds", { ascending: true });
    return { markets: rows ?? [] };
  });

export const getF1OddsHistory = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ marketId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await (supabase as any)
      .from("f1_race_odds_snapshots")
      .select("odds, snapshot_at")
      .eq("market_id", data.marketId)
      .gt("snapshot_at", since)
      .order("snapshot_at", { ascending: true })
      .limit(200);
    return { snapshots: rows ?? [] };
  });

// ---------- Bets ----------

export const listMyF1Bets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: race } = await context.supabase
      .from("f1_bets")
      .select("*, f1_races(name, starts_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: champ } = await context.supabase
      .from("f1_championship_bets")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { raceBets: race ?? [], championshipBets: champ ?? [] };
  });

export const placeF1RaceBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        marketId: z.string().uuid(),
        stake: z.number().positive().min(10).max(50000),
        maxOdds: z.number().min(1.01).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: betId, error } = await (supabaseAdmin as any).rpc("place_f1_race_bet_atomic", {
      p_user_id: context.userId,
      p_market_id: data.marketId,
      p_stake: data.stake,
      p_max_odds: data.maxOdds,
    });
    if (error) {
      const m = error.message ?? "";
      if (/Insufficient/i.test(m)) throw new Error("Insufficient points balance.");
      if (/Odds changed/i.test(m)) throw new Error("Odds moved — please refresh and try again.");
      if (/started/i.test(m)) throw new Error("This race has already started.");
      if (/Market not available|Market not found/i.test(m)) throw new Error("Market unavailable.");
      throw new Error("Could not place bet.");
    }
    return { betId };
  });

export const placeF1ChampionshipBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        marketId: z.string().uuid(),
        stake: z.number().positive().min(10).max(50000),
        maxOdds: z.number().min(1.01).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: betId, error } = await (supabaseAdmin as any).rpc("place_f1_championship_bet_atomic", {
      p_user_id: context.userId,
      p_market_id: data.marketId,
      p_stake: data.stake,
      p_max_odds: data.maxOdds,
    });
    if (error) {
      const m = error.message ?? "";
      if (/Insufficient/i.test(m)) throw new Error("Insufficient points balance.");
      if (/Odds changed/i.test(m)) throw new Error("Odds moved — please refresh and try again.");
      throw new Error("Could not place bet.");
    }
    return { betId };
  });

// ---------- Admin ----------

export const adminSyncF1All = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { syncF1Races, syncF1DriversAndTeams, syncF1Odds } = await import("./services/f1Sync.server");
    const races = await syncF1Races();
    const drivers = await syncF1DriversAndTeams();
    const odds = await syncF1Odds();
    return { races, drivers, odds };
  });

export const adminSettleF1Race = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ raceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { settleF1RaceById } = await import("./services/f1Settlement.server");
    return await settleF1RaceById(data.raceId);
  });

export const adminF1SyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("f1_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);
    return { runs: data ?? [] };
  });

export const adminF1Liability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("f1_bets")
      .select("race_id, market_type, stake, potential_payout, status")
      .eq("status", "open");
    const byRace: Record<string, { totalStake: number; totalPayout: number; count: number }> = {};
    for (const b of data ?? []) {
      const k = b.race_id;
      byRace[k] ??= { totalStake: 0, totalPayout: 0, count: 0 };
      byRace[k].totalStake += Number(b.stake);
      byRace[k].totalPayout += Number(b.potential_payout);
      byRace[k].count++;
    }
    return { liability: byRace };
  });
