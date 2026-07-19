// Client-callable server functions for the F1 feature.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


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
      .order("season", { ascending: false })
      .order("starts_at", { ascending: true });
    const rows = data ?? [];
    const activeSeason = rows.find((r: any) => r.status === "scheduled" || r.status === "in_progress")?.season
      ?? rows[0]?.season
      ?? new Date().getUTCFullYear();
    return { races: rows.filter((r: any) => r.season === activeSeason), season: activeSeason };
  });

export const getF1Race = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ raceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: race }, { data: markets }, { data: drivers }, { data: teams }] = await Promise.all([
      sb.from("f1_races").select("*").eq("id", data.raceId).maybeSingle(),
      sb.from("f1_race_markets")
        .select("id, market_type, selection_key, secondary_selection_key, label, odds, status")
        .eq("race_id", data.raceId)
        .eq("status", "open")
        .order("market_type", { ascending: true })
        .order("odds", { ascending: true }),
      sb.from("f1_drivers").select("driver_key, name, abbr, team_key, photo_url").eq("active", true),
      sb.from("f1_constructors").select("team_key, name, logo_url"),
    ]);
    if (!race) return { race: null, markets: [] as any[], drivers: [] as any[], teams: [] as any[], bettingClosed: false, isLive: false };
    const started = new Date(race.starts_at).getTime() <= Date.now();
    const isLive = race.status === "in_progress" || (started && race.status !== "finished" && race.status !== "cancelled");
    const bettingClosed = started || race.status === "in_progress" || race.status === "finished" || race.status === "cancelled";
    return { race, markets: markets ?? [], drivers: drivers ?? [], teams: teams ?? [], bettingClosed, isLive };
  });

export const getF1LiveRaceState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ raceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: cached } = await sb
      .from("f1_live_race_state")
      .select("*")
      .eq("race_id", data.raceId)
      .maybeSingle();
    const ageMs = cached?.fetched_at ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
    if (cached && ageMs < 25_000) return { state: cached };
    try {
      const { refreshF1LiveRaceState } = await import("./services/f1LiveState.server");
      const fresh = await refreshF1LiveRaceState(data.raceId);
      return { state: fresh ?? cached ?? null };
    } catch {
      return { state: cached ?? null };
    }
  });

export const getF1RaceAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ raceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: race } = await sb
      .from("f1_races")
      .select("id, name, round, season, circuit, country, starts_at, status, settled_at, results, fastest_lap, provider_id")
      .eq("id", data.raceId)
      .maybeSingle();
    if (!race) return { race: null, classification: [], podium: [], fastestLap: null, constructorPoints: [] };

    // Best-effort fastest lap backfill for older races settled before we persisted it.
    let fastestLap: any = race.fastest_lap ?? null;
    if (!fastestLap && race.status === "finished" && race.provider_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchF1FastestLap } = await import("./adapters/apiF1Adapter.server");
        const fl = await fetchF1FastestLap(race.provider_id);
        const top = fl.sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999))[0];
        if (top) {
          fastestLap = top;
          await (supabaseAdmin as any)
            .from("f1_races")
            .update({ fastest_lap: top })
            .eq("id", race.id);
        }
      } catch {
        fastestLap = null;
      }
    }

    const classification = Array.isArray(race.results) ? race.results : [];

    const teamPts: Record<string, { name: string; logo: string | null; points: number; bestPos: number }> = {};
    for (const r of classification) {
      const teamId = r.team?.id ?? r.team?.name;
      if (teamId == null) continue;
      const key = String(teamId);
      const cur = teamPts[key] ?? { name: r.team?.name ?? "—", logo: r.team?.logo ?? null, points: 0, bestPos: 999 };
      // API-F1 exposes "points" on some responses; when missing use F1 scoring by position.
      const pts = Number(r.points ?? scoreByPos(r.position));
      cur.points += Number.isFinite(pts) ? pts : 0;
      cur.bestPos = Math.min(cur.bestPos, r.position ?? 999);
      teamPts[key] = cur;
    }
    const constructorPoints = Object.values(teamPts).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.bestPos - b.bestPos;
    });

    return {
      race,
      classification,
      podium: classification.slice(0, 3),
      fastestLap,
      constructorPoints,
    };
  });

function scoreByPos(p: number | null | undefined): number {
  const table: Record<number, number> = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };
  return p ? table[p] ?? 0 : 0;
}




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
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ marketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await (context.supabase as any)
      .from("f1_race_odds_snapshots")
      .select("odds, snapshot_at")
      .eq("market_id", data.marketId)
      .gt("snapshot_at", since)
      .order("snapshot_at", { ascending: true })
      .limit(200);
    return { snapshots: rows ?? [] };
  });

export const getF1MarketHistories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        marketIds: z.array(z.string().uuid()).min(1).max(10),
        rangeHours: z.number().int().min(1).max(24 * 365).default(24),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.rangeHours * 3600_000).toISOString();
    const { data: rows } = await (context.supabase as any)
      .from("f1_race_odds_snapshots")
      .select("market_id, odds, snapshot_at")
      .in("market_id", data.marketIds)
      .gt("snapshot_at", since)
      .order("snapshot_at", { ascending: true })
      .limit(5000);
    const byMarket: Record<string, { odds: number; snapshot_at: string }[]> = {};
    for (const r of rows ?? []) {
      (byMarket[r.market_id] ??= []).push({ odds: Number(r.odds), snapshot_at: r.snapshot_at });
    }
    return { byMarket };
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
    const season = typeof (races as any).seasonUsed === "number" ? (races as any).seasonUsed : undefined;
    const drivers = await syncF1DriversAndTeams(season);
    const odds = await syncF1Odds(season);
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
