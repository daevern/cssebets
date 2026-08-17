/**
 * UFC adapters for the standard Kalshi-style MarketAnalyticsCard.
 * Reads `ufc_market_snapshots` + `ufc_bets`; moneyline is the primary market.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  MarketHistoryPayload,
  MarketSeries,
  SeriesPoint,
  RecentTradesPayload,
  RecentTrade,
} from "@/lib/market-history.functions";

const SELECTOR_ORDER = ["moneyline", "three_way", "method", "round", "total_rounds", "distance"] as const;

function marketLabel(key: string): string {
  const map: Record<string, string> = {
    moneyline: "Moneyline",
    three_way: "3-Way",
    method: "Method",
    round: "Round",
    total_rounds: "Total rounds",
    distance: "Goes the distance",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

export const getUfcCardMarketHistory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ matchId: z.string().uuid(), market: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<MarketHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fightId = data.matchId;

    const { data: fight } = await supabaseAdmin
      .from("ufc_fights")
      .select("fighter_a, fighter_b, commence_time")
      .eq("id", fightId)
      .maybeSingle();

    const homeTeam = fight?.fighter_a ?? "Fighter A";
    const awayTeam = fight?.fighter_b ?? "Fighter B";

    const [{ data: markets }, { data: snaps }] = await Promise.all([
      supabaseAdmin
        .from("ufc_fight_markets")
        .select("market_type, selection_key, label, odds, is_active")
        .eq("fight_id", fightId),
      supabaseAdmin
        .from("ufc_market_snapshots")
        .select("market_type, selection_key, odds, sampled_at")
        .eq("fight_id", fightId)
        .order("sampled_at", { ascending: false })
        .limit(5000),
    ]);

    const marketRows = markets ?? [];
    const snapRows = ((snaps ?? []) as Array<{
      market_type: string;
      selection_key: string;
      odds: number;
      sampled_at: string;
    }>).slice().reverse();

    const counts = new Map<string, number>();
    for (const s of snapRows) counts.set(s.market_type, (counts.get(s.market_type) ?? 0) + 1);
    for (const m of marketRows) {
      if (!counts.has(m.market_type)) counts.set(m.market_type, 0);
    }

    const availableMarkets = SELECTOR_ORDER
      .filter((k) => counts.has(k))
      .map((k) => ({ key: k, label: marketLabel(k), count: counts.get(k) ?? 0 }));

    const chosen =
      (data.market && counts.has(data.market) && data.market) ||
      (counts.has("moneyline") ? "moneyline" : availableMarkets[0]?.key) ||
      "moneyline";

    const labelFor = (sel: string) => {
      if (chosen === "moneyline" || chosen === "three_way") {
        if (sel === "a") return homeTeam;
        if (sel === "b") return awayTeam;
        if (sel === "draw") return "Draw";
      }
      return marketRows.find((m) => m.market_type === chosen && m.selection_key === sel)?.label ?? sel;
    };

    const seriesKeyFor = (sel: string) => {
      if (sel === "a") return "A";
      if (sel === "b") return "B";
      if (sel === "draw") return "DRAW";
      return sel.toUpperCase();
    };

    const filtered = snapRows.filter((s) => s.market_type === chosen);
    const byTime = new Map<string, Array<{ sel: string; odds: number }>>();
    for (const r of filtered) {
      const arr = byTime.get(r.sampled_at) ?? [];
      arr.push({ sel: r.selection_key, odds: Number(r.odds) });
      byTime.set(r.sampled_at, arr);
    }

    // Seed a "now" point from live markets when history is thin.
    if (byTime.size === 0) {
      const live = marketRows.filter((m) => m.market_type === chosen && m.is_active);
      if (live.length) {
        const t = new Date().toISOString();
        byTime.set(
          t,
          live.map((m) => ({ sel: m.selection_key, odds: Number(m.odds) })),
        );
      }
    }

    const bySel = new Map<string, SeriesPoint[]>();
    const times = [...byTime.keys()].sort();
    for (const t of times) {
      const entries = byTime.get(t)!;
      const inv = entries.reduce((s, e) => s + (e.odds > 1 ? 1 / e.odds : 0), 0);
      for (const e of entries) {
        const raw = e.odds > 1 ? 1 / e.odds : 0;
        const key = seriesKeyFor(e.sel);
        const arr = bySel.get(key) ?? [];
        arr.push({ t, odds: e.odds, prob: inv > 0 ? raw / inv : 0 });
        bySel.set(key, arr);
      }
    }

    let series: MarketSeries[] = [...bySel.entries()]
      .map(([key, points]) => ({
        key,
        label: labelFor(key === "A" ? "a" : key === "B" ? "b" : key === "DRAW" ? "draw" : key.toLowerCase()),
        points,
      }))
      .sort((a, b) => (b.points.at(-1)?.prob ?? 0) - (a.points.at(-1)?.prob ?? 0));
    if (series.length > 8) series = series.slice(0, 8);

    return {
      homeTeam,
      awayTeam,
      kickoffAt: fight?.commence_time ?? null,
      market: chosen,
      marketLabel: marketLabel(chosen),
      sourceLabel: "UFC moneyline market",
      availableMarkets,
      series,
      updatedAt: times.at(-1) ?? null,
    };
  });

export const getUfcCardRecentTrades = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<RecentTradesPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fightId = data.matchId;

    const [{ data: fight }, { data: recent }, { data: allStakes }] = await Promise.all([
      supabaseAdmin
        .from("ufc_fights")
        .select("status, winner")
        .eq("id", fightId)
        .maybeSingle(),
      supabaseAdmin
        .from("ufc_bets")
        .select("selection_key, market_type, stake, placed_at")
        .eq("fight_id", fightId)
        .order("placed_at", { ascending: false })
        .limit(30),
      supabaseAdmin.from("ufc_bets").select("stake").eq("fight_id", fightId),
    ]);

    const trades: RecentTrade[] = ((recent ?? []) as Array<{
      selection_key: string | null;
      market_type: string | null;
      stake: number | null;
      placed_at: string;
    }>)
      .map((r) => ({
        t: r.placed_at,
        outcome: String(r.selection_key ?? "").toUpperCase(),
        market: String(r.market_type ?? ""),
        amount: Math.max(0, Math.round(Number(r.stake ?? 0))),
      }))
      .filter((t) => t.amount > 0);

    const totalVolume = ((allStakes ?? []) as Array<{ stake: number | null }>).reduce(
      (s, r) => s + Math.max(0, Number(r.stake ?? 0)),
      0,
    );

    const status = (fight?.status ?? null) as string | null;
    let winningOutcome: string | null = null;
    if (status === "finished" && fight?.winner) {
      if (fight.winner === "a") winningOutcome = "A";
      else if (fight.winner === "b") winningOutcome = "B";
      else if (fight.winner === "draw") winningOutcome = "DRAW";
    }

    return {
      trades,
      totalVolume: Math.round(totalVolume),
      matchStatus: status,
      homeScore: null,
      awayScore: null,
      winningOutcome,
    };
  });
