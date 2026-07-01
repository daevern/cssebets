// Market Analytics — historical odds/implied-probability chart for a match.
// Reads from `getMarketHistory` server fn. No fake data: if there's no history,
// renders an empty state; a single snapshot renders as a flat line.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
type Range = "1H" | "6H" | "24H" | "ALL";
const RANGES: Range[] = ["1H", "6H", "24H", "ALL"];
const RANGE_MS: Record<Range, number | null> = {
  "1H": 60 * 60_000,
  "6H": 6 * 60 * 60_000,
  "24H": 24 * 60 * 60_000,
  ALL: null,
};

export function MarketAnalyticsCard({ matchId }: { matchId: string }) {
  const fn = useServerFn(getMarketHistory);
  const [market, setMarket] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("prob");
  const [range, setRange] = useState<Range>("ALL");

  const q = useQuery({
    queryKey: ["market-history", matchId, market ?? "default"],
    queryFn: () => fn({ data: { matchId, market } }) as Promise<MarketHistoryPayload>,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = q.data;

  // Filter each series to the selected range, then merge into a single dataset
  // keyed by timestamp for Recharts.
  const { chartData, filteredSeries, supportedRanges } = useMemo(() => {
    if (!data) return { chartData: [] as any[], filteredSeries: [] as MarketSeries[], supportedRanges: RANGES };

    const now = Date.now();
    const spanMs = data.series.reduce((max, s) => {
      const first = s.points[0]?.t ? new Date(s.points[0].t).getTime() : now;
      return Math.max(max, now - first);
    }, 0);
    const supportedRanges = RANGES.filter((r) => {
      const w = RANGE_MS[r];
      return w == null || spanMs >= w * 0.15; // require at least 15% coverage to enable
    });
    const effectiveRange = supportedRanges.includes(range) ? range : "ALL";
    const cutoff = RANGE_MS[effectiveRange];

    const filteredSeries = data.series.map((s) => ({
      ...s,
      points: cutoff == null ? s.points : s.points.filter((p) => now - new Date(p.t).getTime() <= cutoff),
    }));

    // Merge by timestamp
    const byTime = new Map<string, Record<string, number | string>>();
    for (const s of filteredSeries) {
      for (const p of s.points) {
        const row = byTime.get(p.t) ?? { t: p.t };
        row[s.key] = mode === "prob" ? Math.round(p.prob * 1000) / 10 : Math.round(p.odds * 100) / 100;
        byTime.set(p.t, row);
      }
    }
    const chartData = [...byTime.values()].sort(
      (a, b) => new Date(a.t as string).getTime() - new Date(b.t as string).getTime(),
    );
    return { chartData, filteredSeries, supportedRanges };
  }, [data, range, mode]);

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

  const totalPoints = filteredSeries.reduce((n, s) => n + s.points.length, 0);
  const isFlat = totalPoints <= filteredSeries.length; // one point per series max

  return (
    <SectionShell
      updatedAt={data.updatedAt}
      right={
        <div className="flex items-center gap-1 rounded border border-[var(--color-surface-border)] p-0.5">
          {(["prob", "mult"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                mode === m
                  ? "bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {m === "prob" ? "Probability" : "Multiplier"}
            </button>
          ))}
        </div>
      }
    >
      {/* Market selector */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {data.availableMarkets.map((m) => {
          const active = m.key === data.market;
          return (
            <button
              key={m.key}
              onClick={() => setMarket(m.key)}
              className={`shrink-0 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
                  : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Live legend */}
      <div className="mb-3 grid gap-1.5 sm:grid-cols-3">
        {filteredSeries.map((s, idx) => {
          const last = s.points.at(-1);
          const first = s.points[0];
          const value = last
            ? (mode === "prob"
                ? `${Math.round(last.prob * 100)}%`
                : `${last.odds.toFixed(2)}x`)
            : "—";
          const change = last && first
            ? (mode === "prob" ? (last.prob - first.prob) * 100 : last.odds - first.odds)
            : 0;
          const Trend = change > 0.05 ? TrendingUp : change < -0.05 ? TrendingDown : Minus;
          const trendColor = change > 0.05
            ? "text-[var(--color-neon)]"
            : change < -0.05
            ? "text-rose-400"
            : "text-[var(--color-ink-muted)]";
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-2 border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/40 px-2.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                />
                <span className="truncate text-[11px] font-semibold text-[var(--color-ink)]">{s.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-display text-sm font-black tabular-nums text-[var(--color-ink)]">
                  {value}
                </span>
                {s.points.length > 1 && (
                  <Trend className={`h-3 w-3 ${trendColor}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="h-56 w-full sm:h-64">
        {chartData.length === 0 ? (
          <EmptyGraph />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--color-surface-border)" vertical={false} />
              <XAxis
                dataKey="t"
                stroke="var(--color-ink-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => new Date(v).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--color-ink-muted)"
                tick={{ fontSize: 10 }}
                domain={mode === "prob" ? [0, 100] : ["auto", "auto"]}
                tickFormatter={(v) => (mode === "prob" ? `${v}%` : `${v}x`)}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-surface-border)",
                  fontSize: 11,
                }}
                labelFormatter={(v) => new Date(v as string).toLocaleString()}
                formatter={(val: any) => (mode === "prob" ? `${val}%` : `${val}x`)}
              />
              {filteredSeries.map((s, idx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {isFlat && (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          Only one snapshot recorded so far — movement will appear as odds update.
        </p>
      )}

      {/* Range chips */}
      <div className="mt-3 flex items-center justify-end gap-1">
        {RANGES.map((r) => {
          const supported = supportedRanges.includes(r);
          const active = r === range && supported;
          return (
            <button
              key={r}
              disabled={!supported}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                  : supported
                  ? "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  : "cursor-not-allowed text-[var(--color-ink-muted)]/30"
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>
    </SectionShell>
  );
}

function SectionShell({
  children,
  right,
  updatedAt,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  updatedAt?: string | null;
}) {
  return (
    <section className="relative py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--ink-faint)]">
            Market analytics
            {updatedAt && (
              <span className="ml-2 text-[var(--ink-faint)]">
                · {new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
          <h3 className="mt-1 font-display text-2xl font-medium tracking-tight text-[var(--ink)] md:text-3xl">
            Price movement<span className="text-[var(--ink-faint)]">.</span>
          </h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyGraph() {
  return (
    <div className="grid h-48 place-items-center">
      <div className="space-y-1 text-center">
        <p className="font-display text-lg font-medium tracking-tight text-[var(--ink)]">
          No market history yet
        </p>
        <p className="text-[12px] text-[var(--ink-muted)]">
          Movement will appear once price history is available.
        </p>
      </div>
    </div>
  );
}

