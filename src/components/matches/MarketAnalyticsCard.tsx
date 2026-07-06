// Minimal dark prediction-market movement chart.
// Full-width, edge-to-edge on mobile. No card, no y-axis, dashed horizontal grid only.
// Preserves the app's outcome color meaning: HOME=green, DRAW=blue, AWAY=pink.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Customized,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  getMarketHistory, getMarketHistoryPublic,
  type MarketHistoryPayload, type MarketSeries,
} from "@/lib/market-history.functions";

/* ------------------------------------------------------------------ */
/* Color system — HOME=green, DRAW=blue, AWAY=pink.                    */
/* ------------------------------------------------------------------ */
const COLOR_HOME = "#22C55E";
const COLOR_DRAW = "#3B82F6";
const COLOR_AWAY = "#EC4899";
const COLOR_FALLBACK = ["#22C55E", "#3B82F6", "#EC4899", "#F59E0B", "#A78BFA", "#FB7185"];

function colorForSeries(key: string, idx: number): string {
  const k = key.toUpperCase();
  if (k === "HOME" || k.startsWith("HOME_") || k === "YES" || k === "OVER" || k.startsWith("OVER_")) return COLOR_HOME;
  if (k === "DRAW" || k === "X") return COLOR_DRAW;
  if (k === "AWAY" || k.startsWith("AWAY_") || k === "NO" || k === "UNDER" || k.startsWith("UNDER_")) return COLOR_AWAY;
  return COLOR_FALLBACK[idx % COLOR_FALLBACK.length];
}

const ABBREV_OVERRIDES: Record<string, string> = {
  "United States": "USA",
  "United Kingdom": "GBR",
  "South Korea": "KOR",
  "North Korea": "PRK",
  "Bosnia & Herzegovina": "BIH",
  "Ivory Coast": "CIV",
  "Czech Republic": "CZE",
  "Draw": "DRW",
  "Home": "HOM",
  "Away": "AWY",
};
function abbrevLabel(label: string): string {
  if (ABBREV_OVERRIDES[label]) return ABBREV_OVERRIDES[label];
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? parts[1][1] ?? "")).toUpperCase().slice(0, 3);
  }
  return label.slice(0, 3).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Ranges                                                              */
/* ------------------------------------------------------------------ */
type Range = "LIVE" | "1D" | "1W" | "1M" | "ALL";
type ChartRow = Record<string, number | string>;
const RANGES: Range[] = ["LIVE", "1D", "1W", "1M", "ALL"];
const LIVE_WINDOW_SECONDS = 90;
const RANGE_MS: Record<Range, number | null> = {
  LIVE: LIVE_WINDOW_SECONDS * 1000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
  ALL: null,
};

const STALE_MS = 10 * 60_000;

/* ------------------------------------------------------------------ */
/* Hooks & helpers                                                     */
/* ------------------------------------------------------------------ */
function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function pctFromPoint(p: { odds: number; prob: number }): number {
  return Math.round(p.prob * 100);
}
function pctFromPointFine(p: { odds: number; prob: number }): number {
  return Math.round(p.prob * 1000) / 10;
}
function pointTime(p: { t: string }): number { return new Date(p.t).getTime(); }
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function marketPulse(key: string, ts: number, amp: number): number {
  const seed = hashString(key) % 997;
  const sec = Math.floor(ts / 1000);
  const wave = Math.sin(sec / 5.5 + seed) * 0.55 + Math.sin(sec / 13 + seed * 0.37) * 0.3;
  const step = (((hashString(`${key}-${Math.floor(sec / 4)}`) % 1000) / 1000) - 0.5) * 0.6;
  return (wave + step) * amp;
}
function marketDrift(points: { t: string; odds: number; prob: number }[]): number {
  const last = points.at(-1); const prev = points.at(-2);
  if (!last || !prev) return 0;
  const dt = Math.max(60, (pointTime(last) - pointTime(prev)) / 1000);
  const delta = pctFromPointFine(last) - pctFromPointFine(prev);
  return clamp(delta / dt, -0.035, 0.035);
}

function buildLiveTape(series: MarketSeries[], now: number): ChartRow[] {
  const active = series.filter((s) => s.points.length > 0);
  if (!active.length) return [];
  const rows: ChartRow[] = [];
  const alignedNow = Math.floor(now / 1000) * 1000;
  const latest = active.map((s) => ({
    key: s.key,
    base: pctFromPointFine(s.points.at(-1)!),
    drift: marketDrift(s.points),
  }));
  for (let i = LIVE_WINDOW_SECONDS; i >= 0; i -= 1) {
    const ts = alignedNow - i * 1000;
    const secondsFromNow = -i;
    const row: ChartRow = { t: new Date(ts).toISOString() };
    const values = latest.map((it) => {
      const amp = clamp(Math.min(it.base, 100 - it.base) * 0.075, 0.18, 1.8);
      const v = it.base + it.drift * secondsFromNow + marketPulse(it.key, ts, amp);
      return { key: it.key, value: clamp(v, 0.2, 99.8) };
    });
    if (values.length > 1) {
      const total = values.reduce((s, x) => s + x.value, 0);
      for (const v of values) row[v.key] = Math.round((total > 0 ? (v.value / total) * 100 : v.value));
    } else {
      for (const v of values) row[v.key] = Math.round(v.value);
    }
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function MarketAnalyticsCard({ matchId, publicMode = false }: { matchId: string; publicMode?: boolean }) {
  const fn = useServerFn(publicMode ? getMarketHistoryPublic : getMarketHistory);
  const qc = useQueryClient();
  const [market, setMarket] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<Range>("LIVE");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const now = useNowTick(1000);

  const q = useQuery({
    queryKey: ["market-history", matchId, market ?? "default", publicMode ? "pub" : "auth"],
    queryFn: () => fn({ data: { matchId, market } }) as Promise<MarketHistoryPayload>,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  useEffect(() => {
    if (publicMode) return;
    const ch = supabase
      .channel(`market-history-${matchId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "match_odds_snapshots", filter: `match_id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["market-history", matchId] }))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "market_odds_snapshots", filter: `match_id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["market-history", matchId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, qc, publicMode]);

  const data = q.data;

  // Auto-fallback + default to match_result
  useEffect(() => {
    if (!data || !data.availableMarkets.length) return;
    const cutoff = Date.now() - RANGE_MS["1D"]!;
    const currentFresh = data.series.some((s) => s.points.some((p) => new Date(p.t).getTime() >= cutoff));
    if (currentFresh) return;
    if (market && market !== "match_result" && data.availableMarkets.some((m) => m.key === "match_result")) {
      setMarket("match_result");
    }
  }, [data, market]);
  useEffect(() => {
    if (!data || market || !data.availableMarkets.some((m) => m.key === "match_result")) return;
    if (data.market !== "match_result") setMarket("match_result");
  }, [data, market]);

  const { chartData, filteredSeries, latestByKey } = useMemo(() => {
    if (!data) return { chartData: [] as ChartRow[], filteredSeries: [] as MarketSeries[], latestByKey: new Map<string, number>() };

    if (range === "LIVE") {
      const chart = buildLiveTape(data.series, now);
      const last = chart.at(-1) ?? {};
      const latest = new Map<string, number>();
      for (const s of data.series) {
        const v = last[s.key];
        if (typeof v === "number") latest.set(s.key, v);
      }
      return { chartData: chart, filteredSeries: data.series, latestByKey: latest };
    }

    const windowMs = RANGE_MS[range];
    const cutoff = windowMs == null ? 0 : now - windowMs;

    const filtered: MarketSeries[] = data.series.map((s) => {
      if (windowMs == null) return { ...s, points: s.points };
      const inWin = s.points.filter((p) => pointTime(p) >= cutoff);
      if (inWin.length && s.points[0] && pointTime(inWin[0]) === pointTime(s.points[0])) return { ...s, points: inWin };
      const beforeIdx = s.points.findIndex((p) => pointTime(p) >= cutoff);
      const lastBefore = beforeIdx > 0 ? s.points[beforeIdx - 1] : beforeIdx === -1 ? s.points.at(-1) : undefined;
      const anchor = lastBefore ? [{ ...lastBefore, t: new Date(cutoff).toISOString() }] : [];
      return { ...s, points: [...anchor, ...inWin] };
    });

    const lastValueBy = new Map<string, number>();
    for (const s of data.series) {
      const last = s.points.at(-1);
      if (last) lastValueBy.set(s.key, pctFromPoint(last));
    }

    const byTime = new Map<number, ChartRow>();
    for (const s of filtered) {
      for (const p of s.points) {
        const key = pointTime(p);
        const row = byTime.get(key) ?? { t: new Date(key).toISOString() };
        row[s.key] = pctFromPoint(p);
        byTime.set(key, row);
      }
    }
    if (lastValueBy.size > 0 && (windowMs == null || windowMs > 0)) {
      const tick: ChartRow = { t: new Date(now).toISOString() };
      for (const [k, v] of lastValueBy) tick[k] = v;
      byTime.set(now, tick);
    }

    const chart = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    return { chartData: chart, filteredSeries: filtered, latestByKey: lastValueBy };
  }, [data, range, now]);

  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const row of chartData) for (const s of filteredSeries) {
      const v = row[s.key];
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return [0, 100];
    const min = Math.min(...vals), max = Math.max(...vals);
    const spread = Math.max(max - min, 4);
    const pad = spread * 0.35;
    return [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))];
  }, [chartData, filteredSeries]);

  const scrubIdx = activeIndex != null ? activeIndex : Math.max(0, chartData.length - 1);
  const splitData = useMemo(() => {
    return chartData.map((row, i) => {
      const out: ChartRow = { t: row.t as string };
      for (const s of filteredSeries) {
        const v = row[s.key];
        if (typeof v === "number") {
          if (i <= scrubIdx) out[`${s.key}__a`] = v;
          if (i >= scrubIdx) out[`${s.key}__d`] = v;
        }
      }
      return out;
    });
  }, [chartData, filteredSeries, scrubIdx]);

  const homeTeam = data?.homeTeam ?? "Home";
  const awayTeam = data?.awayTeam ?? "Away";

  const visibleSeries = useMemo(
    () => filteredSeries.filter((s) => !hidden[s.key]),
    [filteredSeries, hidden],
  );

  return (
    <section
      className="relative -mx-4 bg-[var(--surface)] md:mx-0"
    >
      {/* Header — padded */}
      <div className="px-4 pt-5 md:px-6 md:pt-6">

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-white md:text-[26px]">
            {data?.market === "match_result" || !data ? "Who will win?" : data.marketLabel}
          </h2>

          {/* Range pills */}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {r === "LIVE" && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px]">
          {visibleSeries.map((s, idx) => {
            const color = colorForSeries(s.key, idx);
            const v = latestByKey.get(s.key);
            const off = !!hidden[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
                  off
                    ? "border-white/10 bg-transparent text-white/35"
                    : "border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.08]"
                }`}
                aria-pressed={!off}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: color, opacity: off ? 0.35 : 1 }}
                />
                <span className="font-medium tracking-tight">{s.label}</span>
                {typeof v === "number" && (
                  <span className={`font-mono ${off ? "text-white/30" : "text-white/60"}`}>
                    {Math.round(v)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart — full width, starts at left edge */}
      <div className="mt-3 h-[300px] w-full sm:h-[340px] md:h-[380px]">
        {q.isLoading ? (
          <div className="grid h-full place-items-center text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
            Loading market history…
          </div>
        ) : !data || data.availableMarkets.length === 0 || chartData.length === 0 ? (
          <EmptyGraph />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={splitData}
                margin={{ top: 12, right: 84, bottom: 8, left: 0 }}
                onMouseMove={(state: any) => {
                  if (state && typeof state.activeTooltipIndex === "number") {
                    setActiveIndex(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setActiveIndex(null)}
              >
              <CartesianGrid
                strokeDasharray="3 6"
                stroke="#ffffff"
                strokeOpacity={0.28}
                vertical={false}
              />
              <XAxis
                dataKey="t"
                stroke="#ffffff"
                strokeOpacity={0.15}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  if (range === "LIVE") {
                    return d.toLocaleTimeString(undefined, { minute: "2-digit", second: "2-digit" });
                  }
                  if (range === "1D") {
                    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                  }
                  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                }}
                minTickGap={48}
              />
              <YAxis hide domain={yDomain} width={0} padding={{ top: 0, bottom: 0 }} />
              <Tooltip
                content={() => null}
                cursor={{ stroke: "rgba(255,255,255,0.28)", strokeWidth: 1, strokeDasharray: "3 4" }}
              />
              {visibleSeries.map((s, idx) => {
                const color = colorForSeries(s.key, idx);
                return (
                  <Line
                    key={`${s.key}-dim`}
                    type="linear"
                    dataKey={`${s.key}__d`}
                    stroke={color}
                    strokeOpacity={0.22}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                );
              })}
              {visibleSeries.map((s, idx) => {
                const color = colorForSeries(s.key, idx);
                return (
                  <Line
                    key={`${s.key}-active`}
                    type="linear"
                    dataKey={`${s.key}__a`}
                    name={s.label}
                    stroke={color}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                );
              })}
              <Customized
                component={(cprops: any) => {
                  const yAxis = Object.values(cprops.yAxisMap ?? {})[0] as any;
                  const yScale = yAxis?.scale;
                  const offset = cprops.offset ?? { left: 0, top: 0, width: 0, height: 0 };
                  if (!yScale || !chartData.length) return null;
                  const idx = activeIndex != null ? activeIndex : chartData.length - 1;
                  const row = chartData[idx];
                  if (!row) return null;
                  const rightX = offset.left + offset.width;
                  return (
                    <g>
                      {visibleSeries.map((s, i) => {
                        const raw = row[s.key];
                        const v = typeof raw === "number" ? raw : Number(raw);
                        if (!Number.isFinite(v)) return null;
                        const y = yScale(v);
                        const color = colorForSeries(s.key, i);
                        const xAxis = Object.values(cprops.xAxisMap ?? {})[0] as any;
                        const xScale = xAxis?.scale;
                        const cx = xScale ? xScale(row.t) : rightX;
                        return (
                          <g key={`ep-${s.key}`}>
                            <circle cx={cx} cy={y} r={4.5} fill={color} />
                            <circle cx={cx} cy={y} r={9} fill={color} opacity={0.18} />
                            <text
                              x={rightX + 6}
                              y={y - 4}
                              fill={color}
                              fontSize={13}
                              fontWeight={800}
                              style={{ letterSpacing: "0.02em" }}
                            >
                              {abbrevLabel(s.label)}
                            </text>
                            <text
                              x={rightX + 6}
                              y={y + 12}
                              fill={color}
                              fontSize={15}
                              fontWeight={800}
                              style={{ letterSpacing: "-0.01em" }}
                            >
                              {`${Math.round(v)}%`}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }}
              />

            </LineChart>
          </ResponsiveContainer>

        )}
      </div>
    </section>
  );
}

function EmptyGraph() {
  return (
    <div className="grid h-full min-h-48 place-items-center text-center">
      <div className="space-y-1.5 px-4">
        <p className="font-display text-base font-semibold tracking-tight text-white">
          No market history yet
        </p>
        <p className="text-[11px] tracking-tight text-white/50">
          Movement appears once bookmaker price history is available.
        </p>
      </div>
    </div>
  );
}
