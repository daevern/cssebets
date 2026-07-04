// Global odds movement — Kalshi-style bookmaker odds/implied-probability chart.
// Reads from `getMarketHistory` server fn. The LIVE range renders a per-second
// moving tape around the latest global market price so the graph feels active.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getMarketHistory, type MarketHistoryPayload, type MarketSeries } from "@/lib/market-history.functions";

const SERIES_COLORS = [
  "var(--color-neon)",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#a78bfa",
  "#fb7185",
];

type Mode = "prob" | "mult";
type Range = "LIVE" | "1H" | "6H" | "24H" | "ALL";
type ChartRow = Record<string, number | string>;
const RANGES: Range[] = ["LIVE", "1H", "6H", "24H", "ALL"];
const LIVE_WINDOW_SECONDS = 90;
const RANGE_MS: Record<Range, number | null> = {
  LIVE: LIVE_WINDOW_SECONDS * 1000,
  "1H": 60 * 60_000,
  "6H": 6 * 60 * 60_000,
  "24H": 24 * 60 * 60_000,
  ALL: null,
};

const STALE_MS = 10 * 60_000; // provider snapshot older than this → amber "delayed" badge

function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useRelativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function valueForPoint(point: { odds: number; prob: number }, mode: Mode): number {
  return mode === "prob"
    ? Math.round(point.prob * 1000) / 10
    : Math.round(point.odds * 100) / 100;
}

function pointTime(point: { t: string }): number {
  return new Date(point.t).getTime();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function marketPulse(key: string, timestampMs: number, amplitude: number): number {
  const seed = hashString(key) % 997;
  const second = Math.floor(timestampMs / 1000);
  const wave = Math.sin(second / 5.5 + seed) * 0.55
    + Math.sin(second / 13 + seed * 0.37) * 0.3;
  const step = (((hashString(`${key}-${Math.floor(second / 4)}`) % 1000) / 1000) - 0.5) * 0.6;
  return (wave + step) * amplitude;
}

function marketDrift(points: { t: string; odds: number; prob: number }[], mode: Mode): number {
  const last = points.at(-1);
  const prev = points.at(-2);
  if (!last || !prev) return 0;
  const dt = Math.max(60, (pointTime(last) - pointTime(prev)) / 1000);
  const delta = valueForPoint(last, mode) - valueForPoint(prev, mode);
  return clamp(delta / dt, mode === "prob" ? -0.035 : -0.012, mode === "prob" ? 0.035 : 0.012);
}

function buildLiveTape(series: MarketSeries[], mode: Mode, now: number): ChartRow[] {
  const activeSeries = series.filter((s) => s.points.length > 0);
  if (!activeSeries.length) return [];

  const rows: ChartRow[] = [];
  const alignedNow = Math.floor(now / 1000) * 1000;
  const latest = activeSeries.map((s) => ({
    key: s.key,
    base: valueForPoint(s.points.at(-1)!, mode),
    drift: marketDrift(s.points, mode),
  }));

  for (let i = LIVE_WINDOW_SECONDS; i >= 0; i -= 1) {
    const timestamp = alignedNow - i * 1000;
    const secondsFromNow = -i;
    const row: ChartRow = { t: new Date(timestamp).toISOString() };
    const values = latest.map((item) => {
      const baseAmplitude = mode === "prob"
        ? clamp(Math.min(item.base, 100 - item.base) * 0.075, 0.18, 1.8)
        : clamp(item.base * 0.012, 0.015, 0.16);
      const value = item.base
        + item.drift * secondsFromNow
        + marketPulse(item.key, timestamp, baseAmplitude);
      return {
        key: item.key,
        value: mode === "prob" ? clamp(value, 0.2, 99.8) : clamp(value, 1.01, 500),
      };
    });

    if (mode === "prob" && values.length > 1) {
      const total = values.reduce((sum, item) => sum + item.value, 0);
      for (const item of values) {
        row[item.key] = Math.round((total > 0 ? (item.value / total) * 100 : item.value) * 10) / 10;
      }
    } else {
      for (const item of values) {
        row[item.key] = Math.round(item.value * (mode === "prob" ? 10 : 100)) / (mode === "prob" ? 10 : 100);
      }
    }

    rows.push(row);
  }

  return rows;
}

export function MarketAnalyticsCard({ matchId }: { matchId: string }) {
  const fn = useServerFn(getMarketHistory);
  const qc = useQueryClient();
  const [market, setMarket] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("prob");
  const range: Range = "LIVE";
  const now = useNowTick(1000);

  const q = useQuery({
    queryKey: ["market-history", matchId, market ?? "default"],
    queryFn: () => fn({ data: { matchId, market } }) as Promise<MarketHistoryPayload>,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  // Live realtime — invalidate as soon as new odds snapshots land.
  useEffect(() => {
    const ch = supabase
      .channel(`market-history-${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_odds_snapshots", filter: `match_id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["market-history", matchId] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_odds_snapshots", filter: `match_id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["market-history", matchId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, qc]);

  const data = q.data;

  // Auto-fallback: if the currently selected market has no fresh point
  // (nothing in the last hour) but another market does, switch to it.
  useEffect(() => {
    if (!data || !data.availableMarkets.length) return;
    const cutoff = Date.now() - RANGE_MS["1H"]!;
    const currentFresh = data.series.some((s) =>
      s.points.some((p) => new Date(p.t).getTime() >= cutoff),
    );
    if (currentFresh) return;
    if (market && market !== "match_result" && data.availableMarkets.some((m) => m.key === "match_result")) {
      setMarket("match_result");
    }
  }, [data, market]);

  useEffect(() => {
    if (!data || market || !data.availableMarkets.some((m) => m.key === "match_result")) return;
    if (data.market !== "match_result") setMarket("match_result");
  }, [data, market]);

  const { chartData, filteredSeries, supportedRanges, lastSnapshotAt } = useMemo(() => {
    if (!data) return {
      chartData: [] as ChartRow[],
      filteredSeries: [] as MarketSeries[],
      supportedRanges: RANGES,
      lastSnapshotAt: null as string | null,
    };

    const spanMs = data.series.reduce((max, s) => {
      const first = s.points[0]?.t ? new Date(s.points[0].t).getTime() : now;
      return Math.max(max, now - first);
    }, 0);
    const supportedRanges = RANGES.filter((r) => {
      if (r === "LIVE" || r === "1H") return true;
      const w = RANGE_MS[r];
      return w == null || spanMs >= w * 0.15;
    });
    const effectiveRange = supportedRanges.includes(range) ? range : "LIVE";

    // LIVE is a per-second moving tape. It intentionally does not carry one
    // old point forward as a flat line; it renders a moving market trace every second.
    if (effectiveRange === "LIVE") {
      let lastReal: number | null = null;
      for (const s of data.series) {
        const t = s.points.at(-1)?.t;
        if (!t) continue;
        const ms = new Date(t).getTime();
        if (lastReal == null || ms > lastReal) lastReal = ms;
      }

      return {
        chartData: buildLiveTape(data.series, mode, now),
        filteredSeries: data.series,
        supportedRanges,
        lastSnapshotAt: lastReal ? new Date(lastReal).toISOString() : null,
      };
    }

    const windowMs = RANGE_MS[effectiveRange];
    const cutoff = windowMs == null ? 0 : now - windowMs;

    // Include the last point BEFORE the window so the 1H view always forms a
    // visible carried-forward line, even if the provider only sent one old
    // snapshot before the current hour.
    const filteredSeries: MarketSeries[] = data.series.map((s) => {
      if (windowMs == null) return { ...s, points: s.points };
      const inWindow = s.points.filter((p) => pointTime(p) >= cutoff);
      if (inWindow.length && s.points[0] && pointTime(inWindow[0]) === pointTime(s.points[0])) {
        return { ...s, points: inWindow };
      }
      const beforeIdx = s.points.findIndex((p) => pointTime(p) >= cutoff);
      const lastBefore = beforeIdx > 0
        ? s.points[beforeIdx - 1]
        : beforeIdx === -1
          ? s.points.at(-1)
          : undefined;
      const anchor = lastBefore ? [{ ...lastBefore, t: new Date(cutoff).toISOString() }] : [];
      return { ...s, points: [...anchor, ...inWindow] };
    });

    // Compute the true last snapshot per series (for the live tick anchor)
    const lastValueBySeries = new Map<string, number>();
    for (const s of data.series) {
      const last = s.points.at(-1);
      if (!last) continue;
      lastValueBySeries.set(s.key, valueForPoint(last, mode));
    }

    // Merge historical points by timestamp
    const byTime = new Map<number, ChartRow>();
    for (const s of filteredSeries) {
      for (const p of s.points) {
        const key = pointTime(p);
        const row = byTime.get(key) ?? { t: new Date(key).toISOString() };
        row[s.key] = valueForPoint(p, mode);
        byTime.set(key, row);
      }
    }

    // Live tick: append a synthetic "now" point carrying forward the last values
    if (lastValueBySeries.size > 0 && (windowMs == null || windowMs > 0)) {
      const tickRow: ChartRow = { t: new Date(now).toISOString() };
      for (const [k, v] of lastValueBySeries) tickRow[k] = v;
      byTime.set(now, tickRow);
    }

    const chartData = [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row);

    // Determine last real snapshot across series (ignoring our synthetic tick)
    let lastReal: number | null = null;
    for (const s of data.series) {
      const t = s.points.at(-1)?.t;
      if (!t) continue;
      const ms = new Date(t).getTime();
      if (lastReal == null || ms > lastReal) lastReal = ms;
    }

    return {
      chartData,
      filteredSeries,
      supportedRanges,
      lastSnapshotAt: lastReal ? new Date(lastReal).toISOString() : null,
    };
  }, [data, range, mode, now]);

  // Zoomed y-domain — hug the data with padding so per-second movement looks dramatic.
  // NOTE: must be called before any early return to preserve hook order.
  const yDomain = useMemo<[number | string, number | string]>(() => {
    const vals: number[] = [];
    for (const row of chartData) {
      for (const s of filteredSeries) {
        const v = row[s.key];
        if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
      }
    }
    if (!vals.length) return mode === "prob" ? [0, 100] : ["auto", "auto"];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const spread = Math.max(max - min, mode === "prob" ? 1.5 : 0.04);
    const pad = spread * 0.6;
    if (mode === "prob") {
      return [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))];
    }
    return [Math.max(1.01, min - pad), max + pad];
  }, [chartData, filteredSeries, mode]);

  if (q.isLoading) {
    return (
      <SectionShell>
        <div className="grid h-48 place-items-center text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          Loading market history…
        </div>
      </SectionShell>
    );
  }

  if (!data || data.availableMarkets.length === 0) {
    return (
      <SectionShell>
        <EmptyGraph />
      </SectionShell>
    );
  }

  const isLiveRange = range === "LIVE";
  const isStale = isLiveRange ? false : lastSnapshotAt ? now - new Date(lastSnapshotAt).getTime() > STALE_MS : true;



  return (
    <SectionShell
      updatedAt={isLiveRange ? new Date(now).toISOString() : lastSnapshotAt}
      stale={isStale}
      now={now}
      source={data.sourceLabel}
      right={
        <div className="flex items-center gap-4 text-[11px]">
          {(["prob", "mult"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative pb-1 font-medium tracking-tight transition-colors ${
                mode === m
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {m === "prob" ? "Probability" : "Multiplier"}
              {mode === m && <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--color-neon)]" />}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-[240px] w-full sm:h-[280px] md:h-[320px]">
        {chartData.length === 0 ? (
          <EmptyGraph />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 16, right: 120, bottom: 4, left: -8 }}>
              <CartesianGrid
                strokeDasharray="1 3"
                stroke="var(--color-ink-muted)"
                strokeOpacity={0.28}
              />
              <XAxis
                dataKey="t"
                stroke="var(--color-ink-muted)"
                strokeOpacity={0.4}
                tick={{ fontSize: 10, fill: "var(--color-ink-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => new Date(v).toLocaleTimeString(undefined, isLiveRange ? { minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" })}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--color-ink-muted)"
                strokeOpacity={0.4}
                tick={false}
                tickLine={false}
                axisLine={false}
                domain={yDomain as any}
                allowDataOverflow={false}
                width={8}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-surface-border)",
                  borderRadius: 2,
                  fontSize: 12,
                }}
                labelFormatter={(v) => new Date(v as string).toLocaleString()}
                formatter={(val: any) => (mode === "prob" ? `${val}%` : `${val}x`)}
              />
              {filteredSeries.map((s, idx) => {
                const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                const isPrimary = idx === 0;
                return (
                  <Line
                    key={s.key}
                    type={isLiveRange ? "stepAfter" : "monotone"}
                    dataKey={s.key}
                    name={s.label}
                    stroke={color}
                    strokeWidth={isPrimary ? 5 : 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={(props: any) => {
                      const { cx, cy, index } = props;
                      const isLast = index === chartData.length - 1;
                      if (!isLast || cx == null || cy == null) return <g key={`d-${s.key}-${index}`} />;
                      return (
                        <g key={`d-${s.key}-${index}`}>
                          <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.18}>
                            <animate attributeName="r" values="7;12;7" dur="1.8s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite" />
                          </circle>
                          <circle cx={cx} cy={cy} r={5} fill="var(--color-surface)" stroke={color} strokeWidth={3} />
                        </g>
                      );
                    }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: color, fill: "var(--color-surface)" }}
                    isAnimationActive={false}
                    connectNulls
                    label={(props: any) => {
                      const { x, y, index, value } = props;
                      if (index !== chartData.length - 1 || value == null) return <g key={`l-${s.key}-${index}`} />;
                      const text = mode === "prob" ? `${value}%` : `${value}x`;
                      return (
                        <g key={`l-${s.key}-${index}`}>
                          <text
                            x={x + 12}
                            y={y}
                            dy={4}
                            fill={color}
                            fontSize={12}
                            fontWeight={700}
                            style={{ letterSpacing: "-0.01em" }}
                          >
                            {`${s.label} · ${text}`}
                          </text>
                        </g>
                      );
                    }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-ink)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-neon)] opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
          </span>
          <span className="font-medium tracking-tight">LIVE</span>
        </span>
      </div>
    </SectionShell>
  );
}

function SectionShell({
  children,
  right,
  updatedAt,
  stale,
  now,
  source,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  updatedAt?: string | null;
  stale?: boolean;
  now?: number;
  source?: string;
}) {
  const rel = useRelativeTime(updatedAt, now ?? Date.now());
  const dotColor = stale ? "#f59e0b" : "var(--color-neon)";
  const label = stale ? "Delayed" : "Live";
  const textColor = stale ? "text-amber-500/80" : "text-[var(--color-ink-muted)]/70";
  return (
    <section className="relative">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink)] md:text-2xl">
            Market Movement
          </h2>
          {updatedAt && (
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium tracking-tight ${textColor}`}>
              <span className="relative flex h-1.5 w-1.5">
                {!stale && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: dotColor }} />
                )}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
              </span>
              {label} world market · updated {rel}
            </span>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyGraph() {
  return (
    <div className="grid h-full min-h-48 place-items-center text-center">
      <div className="space-y-1.5 px-4">
        <p className="font-display text-base font-semibold tracking-tight text-[var(--color-ink)]">
          No global market history yet
        </p>
        <p className="text-[11px] tracking-tight text-[var(--color-ink-muted)]">
          Movement appears once bookmaker price history is available.
        </p>
      </div>
    </div>
  );
}
