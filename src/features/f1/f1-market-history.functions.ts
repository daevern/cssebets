/**
 * F1 adapters for the standard Kalshi-style MarketAnalyticsCard.
 * Groups `f1_race_markets` by market_type and builds implied-prob series from
 * `f1_race_odds_snapshots`. Primary market: race_winner.
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

const SELECTOR_ORDER = [
  "race_winner",
  "podium",
  "top_5_finish",
  "points_finish",
  "fastest_lap",
  "top_constructor_race",
  "head_to_head",
] as const;

function marketLabel(key: string): string {
  const map: Record<string, string> = {
    race_winner: "Race winner",
    podium: "Podium",
    top_5_finish: "Top 5",
    points_finish: "Points finish",
    fastest_lap: "Fastest lap",
    top_constructor_race: "Top constructor",
    head_to_head: "Head to head",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

function keyify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export const getF1CardMarketHistory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ matchId: z.string().uuid(), market: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<MarketHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raceId = data.matchId;

    const { data: race } = await supabaseAdmin
      .from("f1_races")
      .select("name, starts_at, status, results, fastest_lap")
      .eq("id", raceId)
      .maybeSingle();

    const { data: markets } = await supabaseAdmin
      .from("f1_race_markets")
      .select("id, market_type, selection_key, secondary_selection_key, label, odds, status")
      .eq("race_id", raceId);

    const rows = markets ?? [];
    const byType = new Map<string, typeof rows>();
    for (const m of rows) {
      const arr = byType.get(m.market_type) ?? [];
      arr.push(m);
      byType.set(m.market_type, arr);
    }

    const marketIds = rows.map((m) => m.id);
    // Bound the tape read — full-table sort across millions of rows was a top IO sink.
    const sinceIso = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: snaps } = marketIds.length
      ? await supabaseAdmin
          .from("f1_race_odds_snapshots")
          .select("market_id, odds, snapshot_at")
          .in("market_id", marketIds)
          .gte("snapshot_at", sinceIso)
          .order("snapshot_at", { ascending: false })
          .limit(4000)
      : { data: [] as Array<{ market_id: string; odds: number; snapshot_at: string }> };

    const snapRows = ((snaps ?? []) as Array<{
      market_id: string;
      odds: number;
      snapshot_at: string;
    }>).slice().reverse();

    const counts = new Map<string, number>();
    const idToType = new Map(rows.map((m) => [m.id, m.market_type]));
    for (const s of snapRows) {
      const t = idToType.get(s.market_id);
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const t of byType.keys()) {
      if (!counts.has(t)) counts.set(t, 0);
    }

    const availableMarkets = SELECTOR_ORDER
      .filter((k) => byType.has(k))
      .map((k) => ({ key: k, label: marketLabel(k), count: counts.get(k) ?? 0 }));

    const chosen =
      (data.market && byType.has(data.market) && data.market) ||
      (byType.has("race_winner") ? "race_winner" : availableMarkets[0]?.key) ||
      "race_winner";

    const chosenMarkets = (byType.get(chosen) ?? [])
      .slice()
      .sort((a, b) => Number(a.odds) - Number(b.odds))
      .slice(0, 8);
    const chosenIds = new Set(chosenMarkets.map((m) => m.id));
    const metaById = new Map(chosenMarkets.map((m) => [m.id, m]));

    const byTime = new Map<string, Array<{ id: string; odds: number }>>();
    for (const s of snapRows) {
      if (!chosenIds.has(s.market_id)) continue;
      const arr = byTime.get(s.snapshot_at) ?? [];
      arr.push({ id: s.market_id, odds: Number(s.odds) });
      byTime.set(s.snapshot_at, arr);
    }

    if (byTime.size === 0 && chosenMarkets.length) {
      const t = new Date().toISOString();
      byTime.set(
        t,
        chosenMarkets.map((m) => ({ id: m.id, odds: Number(m.odds) })),
      );
    }

    const bySel = new Map<string, SeriesPoint[]>();
    const times = [...byTime.keys()].sort();
    for (const t of times) {
      const entries = byTime.get(t)!;
      const inv = entries.reduce((s, e) => s + (e.odds > 1 ? 1 / e.odds : 0), 0);
      for (const e of entries) {
        const meta = metaById.get(e.id);
        if (!meta) continue;
        const key = meta.selection_key;
        const raw = e.odds > 1 ? 1 / e.odds : 0;
        const arr = bySel.get(key) ?? [];
        arr.push({ t, odds: e.odds, prob: inv > 0 ? raw / inv : 0 });
        bySel.set(key, arr);
      }
    }

    let series: MarketSeries[] = [...bySel.entries()]
      .map(([key, points]) => {
        const meta = chosenMarkets.find((m) => m.selection_key === key);
        return {
          key,
          label: meta?.label ?? key,
          points,
        };
      })
      .sort((a, b) => (b.points.at(-1)?.prob ?? 0) - (a.points.at(-1)?.prob ?? 0));

    return {
      homeTeam: race?.name ?? "Race",
      awayTeam: "",
      kickoffAt: race?.starts_at ?? null,
      market: chosen,
      marketLabel: marketLabel(chosen),
      sourceLabel: "F1 race market",
      availableMarkets,
      series,
      updatedAt: times.at(-1) ?? null,
    };
  });

export const getF1CardRecentTrades = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<RecentTradesPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raceId = data.matchId;

    const [{ data: race }, { data: recent }, { data: allStakes }, { data: markets }] =
      await Promise.all([
        supabaseAdmin
          .from("f1_races")
          .select("status, results, fastest_lap")
          .eq("id", raceId)
          .maybeSingle(),
        supabaseAdmin
          .from("f1_bets")
          .select("selection_key, market_type, stake, created_at")
          .eq("race_id", raceId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin.from("f1_bets").select("stake").eq("race_id", raceId),
        supabaseAdmin
          .from("f1_race_markets")
          .select("market_type, selection_key, secondary_selection_key, status, winning")
          .eq("race_id", raceId),
      ]);

    const trades: RecentTrade[] = ((recent ?? []) as Array<{
      selection_key: string | null;
      market_type: string | null;
      stake: number | null;
      created_at: string;
    }>)
      .map((r) => ({
        t: r.created_at,
        outcome: String(r.selection_key ?? ""),
        market: String(r.market_type ?? ""),
        amount: Math.max(0, Math.round(Number(r.stake ?? 0))),
      }))
      .filter((t) => t.amount > 0);

    const totalVolume = ((allStakes ?? []) as Array<{ stake: number | null }>).reduce(
      (s, r) => s + Math.max(0, Number(r.stake ?? 0)),
      0,
    );

    const status = (race?.status ?? null) as string | null;
    let winningOutcome: string | null = null;
    let winningOutcomes: string[] | null = null;
    const winnersByMarket: Record<string, string[]> = {};

    if (status === "finished") {
      for (const m of markets ?? []) {
        if (m.winning !== true) continue;
        (winnersByMarket[m.market_type] ??= []).push(m.selection_key);
      }
      const raceWinners = winnersByMarket["race_winner"] ?? [];
      if (raceWinners.length === 1) winningOutcome = raceWinners[0];
      else if (raceWinners.length > 1) winningOutcomes = raceWinners;

      if (!winningOutcome && !winningOutcomes?.length) {
        const results = Array.isArray(race?.results) ? race!.results : [];
        const first = results
          .filter((r: unknown) => r && typeof r === "object")
          .sort(
            (a: any, b: any) => (a.position ?? 999) - (b.position ?? 999),
          )[0] as { driver?: { name?: string } } | undefined;
        const name = first?.driver?.name;
        if (name) {
          winningOutcome = keyify(name);
          winnersByMarket["race_winner"] = [winningOutcome];
        }
      }
    }

    return {
      trades,
      totalVolume: Math.round(totalVolume),
      matchStatus: status,
      homeScore: null,
      awayScore: null,
      winningOutcome,
      winningOutcomes,
      winnersByMarket: Object.keys(winnersByMarket).length ? winnersByMarket : null,
    };
  });
