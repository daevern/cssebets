// Server function: returns historical odds snapshots for the market analytics graph.
// Reads from `match_odds_snapshots` (1x2/match result) and `market_odds_snapshots`
// (all other markets). Both tables are admin-only via RLS, so we go through
// supabaseAdmin server-side. Client never receives raw bookmaker metadata.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MARKET_LABELS, selectionLabel, type MarketKey } from "@/lib/markets-catalog";

export type SeriesPoint = { t: string; odds: number; prob: number };
export type MarketSeries = { key: string; label: string; points: SeriesPoint[] };
export type MarketOption = { key: string; label: string; count: number };

export type MarketHistoryPayload = {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
  market: string;
  marketLabel: string;
  sourceLabel: string;
  availableMarkets: MarketOption[];
  series: MarketSeries[];
  updatedAt: string | null;
};

// A curated set of markets we surface in the selector. Filtered by
// availability so the user only sees markets that actually have history.
const SELECTOR_ORDER: string[] = [
  "match_result",
  "over_under_2_5",
  "btts",
  "double_chance",
  "to_qualify",
  "cards_over_under_3_5",
  "cards_over_under_4_5",
  "corners_over_under_9_5",
  "corners_over_under_10_5",
  "half_time_full_time",
  "correct_score",
];

function labelFor(market: string, homeTeam: string, awayTeam: string, selection: string): string {
  if (market === "match_result") {
    if (selection === "HOME") return homeTeam;
    if (selection === "AWAY") return awayTeam;
    return "Draw";
  }
  if (market === "to_qualify") {
    if (selection === "HOME") return `${homeTeam} to advance`;
    if (selection === "AWAY") return `${awayTeam} to advance`;
  }
  if (market === "double_chance") {
    if (selection === "HOME_OR_DRAW") return `${homeTeam} or Draw`;
    if (selection === "HOME_OR_AWAY") return `${homeTeam} or ${awayTeam}`;
    if (selection === "DRAW_OR_AWAY") return `Draw or ${awayTeam}`;
  }
  return selectionLabel(selection);
}

function marketLabel(market: string): string {
  if (market === "match_result") return "Match Result";
  return MARKET_LABELS[market as MarketKey] ?? market.replace(/_/g, " ");
}

async function buildMarketHistory(
  supabaseAdmin: any,
  data: { matchId: string; market?: string },
): Promise<MarketHistoryPayload> {
  const matchId = data.matchId;
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("home_team, away_team, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();

  const homeTeam = match?.home_team ?? "Home";
  const awayTeam = match?.away_team ?? "Away";
  const kickoffAt = match?.kickoff_at ?? null;

  const [{ count: mrCount }, { data: mkRows }] = await Promise.all([
    supabaseAdmin
      .from("match_odds_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("match_id", matchId),
    supabaseAdmin
      .from("market_odds_snapshots")
      .select("market")
      .eq("match_id", matchId),
  ]);

  const counts = new Map<string, number>();
  if ((mrCount ?? 0) > 0) counts.set("match_result", mrCount as number);
  for (const r of (mkRows ?? []) as Array<{ market: string }>) {
    counts.set(r.market, (counts.get(r.market) ?? 0) + 1);
  }

  const availableMarkets: MarketOption[] = SELECTOR_ORDER
    .filter((k) => counts.has(k))
    .map((k) => ({ key: k, label: marketLabel(k), count: counts.get(k) ?? 0 }));

  const chosen = (data.market && counts.has(data.market))
    ? data.market
    : counts.has("match_result")
      ? "match_result"
      : availableMarkets[0]?.key ?? "match_result";

  let series: MarketSeries[] = [];
  let updatedAt: string | null = null;

  if (chosen === "match_result") {
    const { data: snaps } = await supabaseAdmin
      .from("match_odds_snapshots")
      .select("home_odds, draw_odds, away_odds, sampled_at")
      .eq("match_id", matchId)
      .order("sampled_at", { ascending: true })
      .limit(500);
    const rows = (snaps ?? []) as Array<{
      home_odds: number; draw_odds: number; away_odds: number; sampled_at: string;
    }>;
    const bySel: Record<"HOME" | "DRAW" | "AWAY", SeriesPoint[]> = { HOME: [], DRAW: [], AWAY: [] };
    for (const r of rows) {
      const h = Number(r.home_odds), d = Number(r.draw_odds), a = Number(r.away_odds);
      const total = (1 / h) + (1 / d) + (1 / a);
      bySel.HOME.push({ t: r.sampled_at, odds: h, prob: total ? (1 / h) / total : 0 });
      bySel.DRAW.push({ t: r.sampled_at, odds: d, prob: total ? (1 / d) / total : 0 });
      bySel.AWAY.push({ t: r.sampled_at, odds: a, prob: total ? (1 / a) / total : 0 });
    }
    series = [
      { key: "HOME", label: homeTeam, points: bySel.HOME },
      { key: "DRAW", label: "Draw", points: bySel.DRAW },
      { key: "AWAY", label: awayTeam, points: bySel.AWAY },
    ];
    updatedAt = rows.at(-1)?.sampled_at ?? null;
  } else {
    const { data: snaps } = await supabaseAdmin
      .from("market_odds_snapshots")
      .select("selection, odds, snapshot_at")
      .eq("match_id", matchId)
      .eq("market", chosen)
      .order("snapshot_at", { ascending: true })
      .limit(2000);
    const rows = (snaps ?? []) as Array<{ selection: string; odds: number; snapshot_at: string }>;
    const byTime = new Map<string, Array<{ sel: string; odds: number }>>();
    for (const r of rows) {
      const arr = byTime.get(r.snapshot_at) ?? [];
      arr.push({ sel: r.selection, odds: Number(r.odds) });
      byTime.set(r.snapshot_at, arr);
    }
    const bySel = new Map<string, SeriesPoint[]>();
    const times = [...byTime.keys()].sort();
    for (const t of times) {
      const entries = byTime.get(t)!;
      const inv = entries.reduce((s, e) => s + (e.odds > 0 ? 1 / e.odds : 0), 0);
      for (const e of entries) {
        const raw = e.odds > 0 ? 1 / e.odds : 0;
        const prob = inv > 0 ? raw / inv : 0;
        const arr = bySel.get(e.sel) ?? [];
        arr.push({ t, odds: e.odds, prob });
        bySel.set(e.sel, arr);
      }
    }
    series = [...bySel.entries()]
      .map(([sel, points]) => ({ key: sel, label: labelFor(chosen, homeTeam, awayTeam, sel), points }))
      .sort((a, b) => (b.points.at(-1)?.prob ?? 0) - (a.points.at(-1)?.prob ?? 0));
    if (series.length > 6) series = series.slice(0, 6);
    updatedAt = times.at(-1) ?? null;
  }

  return {
    homeTeam,
    awayTeam,
    kickoffAt,
    market: chosen,
    marketLabel: marketLabel(chosen),
    sourceLabel: chosen === "match_result" ? "Global 90-min market" : "Global bookmaker market",
    availableMarkets,
    series,
    updatedAt,
  };
}

export const getMarketHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string; market?: string }) => input)
  .handler(async ({ data }): Promise<MarketHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildMarketHistory(supabaseAdmin, data);
  });

// Public variant for the visitor-facing landing page. Reads the same cached
// snapshot tables — no privileged data is exposed.
export const getMarketHistoryPublic = createServerFn({ method: "POST" })
  .inputValidator((input: { matchId: string; market?: string }) => input)
  .handler(async ({ data }): Promise<MarketHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildMarketHistory(supabaseAdmin, data);
  });

