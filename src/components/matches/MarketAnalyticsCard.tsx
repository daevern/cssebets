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
      {/* Chart — the soul of the page. Taller, minimal chrome. */}
      <div className="h-72 w-full sm:h-80 md:h-96">
        {chartData.length === 0 ? (
          <EmptyGraph />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="1 4" stroke="var(--color-surface-border)" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="t"
                stroke="var(--color-ink-muted)"
                strokeOpacity={0.4}
                tick={{ fontSize: 10, fill: "var(--color-ink-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => new Date(v).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--color-ink-muted)"
                strokeOpacity={0.4}
                tick={{ fontSize: 10, fill: "var(--color-ink-muted)" }}
                tickLine={false}
                axisLine={false}
                domain={mode === "prob" ? [0, 100] : ["auto", "auto"]}
                tickFormatter={(v) => (mode === "prob" ? `${v}%` : `${v}x`)}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-surface-border)",
                  borderRadius: 2,
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
                  strokeWidth={1.5}
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
        <p className="mt-3 text-[11px] tracking-tight text-[var(--color-ink-muted)]">
          Only one snapshot recorded so far — movement will appear as multipliers update.
        </p>
      )}

      {/* Range chips — text-only, restrained */}
      <div className="mt-5 flex items-center justify-end gap-4 text-[11px]">
        {RANGES.map((r) => {
          const supported = supportedRanges.includes(r);
          const active = r === range && supported;
          return (
            <button
              key={r}
              disabled={!supported}
              onClick={() => setRange(r)}
              className={`relative pb-1 font-medium tracking-tight transition-colors ${
                active
                  ? "text-[var(--color-ink)]"
                  : supported
                  ? "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  : "cursor-not-allowed text-[var(--color-ink-muted)]/30"
              }`}
            >
              {r}
              {active && <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--color-neon)]" />}
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
    <section className="relative">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            <Activity className="h-3 w-3" /> Market analytics
          </span>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink)] md:text-2xl">
            Market movement
          </h2>
          {updatedAt && (
            <span className="text-[10px] font-medium tracking-tight text-[var(--color-ink-muted)]/70">
              Updated {new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
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
          No market history yet
        </p>
        <p className="text-[11px] tracking-tight text-[var(--color-ink-muted)]">
          Market movement will appear once price history is available.
        </p>
      </div>
    </div>
  );
}

