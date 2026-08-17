// Club-football equivalents of the World Cup market-history / trade-tape
// server functions, so `MarketAnalyticsCard` renders 1:1 for La Liga, EPL,
// Serie A, UCL, etc. Reads sports_odds_snapshots + sports_bets.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  MarketHistoryPayload,
  MarketSeries,
  SeriesPoint,
  RecentTradesPayload,
  RecentTrade,
} from "@/lib/market-history.functions";

export const getFootballMarketHistory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ matchId: z.string().uuid(), market: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<MarketHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ev } = await (supabaseAdmin as any)
      .from("sports_events")
      .select("home_name, away_name, scheduled_at")
      .eq("id", data.matchId)
      .maybeSingle();

    const homeTeam = ev?.home_name ?? "Home";
    const awayTeam = ev?.away_name ?? "Away";

    const { data: markets } = await (supabaseAdmin as any)
      .from("sports_markets")
      .select("id, market_key, display_name, sort_order, sports_market_selections (selection_key, display_name)")
      .eq("sports_event_id", data.matchId)
      .order("sort_order", { ascending: true });

    const rows = (markets ?? []) as any[];
    if (rows.length === 0) {
      return {
        homeTeam,
        awayTeam,
        kickoffAt: ev?.scheduled_at ?? null,
        market: "match_result",
        marketLabel: "Match Result",
        sourceLabel: "Global bookmaker market",
        availableMarkets: [],
        series: [],
        updatedAt: null,
      };
    }

    // Which markets actually have snapshot history?
    const { data: snapCounts } = await (supabaseAdmin as any)
      .from("sports_odds_snapshots")
      .select("sports_market_id")
      .in("sports_market_id", rows.map((m) => m.id))
      .limit(20000);

    const counts = new Map<string, number>();
    for (const s of (snapCounts ?? []) as any[]) {
      counts.set(s.sports_market_id, (counts.get(s.sports_market_id) ?? 0) + 1);
    }

    const withHistory = rows.filter((m) => (counts.get(m.id) ?? 0) > 0);
    const pool = withHistory.length > 0 ? withHistory : rows;

    const availableMarkets = pool.slice(0, 30).map((m) => ({
      key: m.market_key as string,
      label: m.display_name as string,
      count: counts.get(m.id) ?? 0,
    }));

    const chosenRow =
      pool.find((m) => m.market_key === data.market) ??
      pool.find((m) => m.market_key === "match_result") ??
      pool[0];

    const labels: Record<string, string> = {};
    for (const s of chosenRow.sports_market_selections ?? []) {
      labels[s.selection_key] =
        chosenRow.market_key === "match_result"
          ? s.selection_key === "home"
            ? homeTeam
            : s.selection_key === "away"
              ? awayTeam
              : "Draw"
          : s.display_name;
    }

    const { data: snaps } = await (supabaseAdmin as any)
      .from("sports_odds_snapshots")
      .select("selection_key, decimal_odds, fetched_at, provider_ts")
      .eq("sports_market_id", chosenRow.id)
      .order("fetched_at", { ascending: false })
      .limit(3000);

    const ordered = (((snaps ?? []) as any[]).slice().reverse());
    const byTime = new Map<string, Array<{ sel: string; odds: number }>>();
    for (const r of ordered) {
      const t = (r.provider_ts ?? r.fetched_at) as string;
      const arr = byTime.get(t) ?? [];
      arr.push({ sel: r.selection_key as string, odds: Number(r.decimal_odds) });
      byTime.set(t, arr);
    }

    const bySel = new Map<string, SeriesPoint[]>();
    const times = [...byTime.keys()].sort();
    for (const t of times) {
      const entries = byTime.get(t)!;
      const inv = entries.reduce((s, e) => s + (e.odds > 0 ? 1 / e.odds : 0), 0);
      for (const e of entries) {
        const raw = e.odds > 0 ? 1 / e.odds : 0;
        const arr = bySel.get(e.sel) ?? [];
        arr.push({ t, odds: e.odds, prob: inv > 0 ? raw / inv : 0 });
        bySel.set(e.sel, arr);
      }
    }

    const seriesKeyFor = (k: string) => {
      const s = k.toLowerCase();
      if (s === "home" || s.startsWith("over_") || s === "yes") return s === "home" ? "HOME" : k.toUpperCase();
      if (s === "draw") return "DRAW";
      if (s === "away") return "AWAY";
      return k.toUpperCase();
    };

    let series: MarketSeries[] = [...bySel.entries()]
      .map(([sel, points]) => ({
        key: seriesKeyFor(sel),
        label: labels[sel] ?? sel,
        points,
      }))
      .sort((a, b) => (b.points.at(-1)?.prob ?? 0) - (a.points.at(-1)?.prob ?? 0));
    if (series.length > 6) series = series.slice(0, 6);

    return {
      homeTeam,
      awayTeam,
      kickoffAt: ev?.scheduled_at ?? null,
      market: chosenRow.market_key,
      marketLabel: chosenRow.display_name,
      sourceLabel: "Global bookmaker market",
      availableMarkets,
      series,
      updatedAt: times.at(-1) ?? null,
    };
  });

export const getFootballRecentTrades = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<RecentTradesPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: ev }, { data: recent }, { data: allStakes }] = await Promise.all([
      (supabaseAdmin as any)
        .from("sports_events")
        .select("status, home_score, away_score")
        .eq("id", data.matchId)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("sports_bets")
        .select("selection_key, market_key, stake, placed_at")
        .eq("sports_event_id", data.matchId)
        .order("placed_at", { ascending: false })
        .limit(30),
      (supabaseAdmin as any)
        .from("sports_bets")
        .select("stake")
        .eq("sports_event_id", data.matchId),
    ]);

    const trades: RecentTrade[] = ((recent ?? []) as any[])
      .map((r) => ({
        t: r.placed_at,
        outcome: String(r.selection_key ?? "").toUpperCase(),
        market: String(r.market_key ?? ""),
        amount: Math.max(0, Math.round(Number(r.stake ?? 0))),
      }))
      .filter((t) => t.amount > 0);

    const totalVolume = ((allStakes ?? []) as any[]).reduce(
      (s, r) => s + Math.max(0, Number(r.stake ?? 0)),
      0,
    );

    const status = (ev?.status ?? null) as string | null;
    const hs = ev?.home_score == null ? null : Number(ev.home_score);
    const as = ev?.away_score == null ? null : Number(ev.away_score);
    let winningOutcome: string | null = null;
    const finished = !!status && ["finished", "FT", "AET", "PEN", "final", "completed"].includes(status);
    if (finished && hs != null && as != null) {
      winningOutcome = hs > as ? "HOME" : as > hs ? "AWAY" : "DRAW";
    }

    return {
      trades,
      totalVolume: Math.round(totalVolume),
      matchStatus: status,
      homeScore: hs,
      awayScore: as,
      winningOutcome,
    };
  });
