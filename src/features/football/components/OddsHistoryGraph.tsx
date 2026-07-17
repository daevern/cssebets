import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getFootballOddsHistory } from "../football.functions";

// Neon-friendly palette that cycles across selections.
const COLORS = ["#39FF88", "#7EC8FF", "#FFB86B", "#FF6B9E", "#B58BFF"];

type Point = { t: string; odds: number };
type Series = { selectionKey: string; points: Point[] };

export default function OddsHistoryGraph({
  marketId,
  selectionLabels,
  hours = 12,
}: {
  marketId: string;
  selectionLabels?: Record<string, string>;
  hours?: number;
}) {
  const fetcher = useServerFn(getFootballOddsHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["football-odds-history", marketId, hours],
    queryFn: () => fetcher({ data: { marketId, hours } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const chart = useMemo(() => computeChart(data?.series ?? []), [data]);

  if (isLoading) {
    return (
      <div className="mt-3 h-24 rounded-lg bg-white/[0.03] animate-pulse" aria-hidden />
    );
  }
  if (!chart) {
    return (
      <div className="mt-3 text-[11px] text-[var(--ink-muted)]">
        No price history yet.
      </div>
    );
  }

  const { width, height, paths, yMin, yMax, series } = chart;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
          Price · last {hours}h
        </span>
        <span className="text-[10px] text-[var(--ink-muted)] tabular-nums">
          {yMin.toFixed(2)} – {yMax.toFixed(2)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-24 rounded-lg bg-white/[0.03]"
        role="img"
        aria-label="Odds history"
      >
        {paths.map((d, i) => (
          <path
            key={series[i].selectionKey}
            d={d}
            fill="none"
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s, i) => (
          <span
            key={s.selectionKey}
            className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-muted)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {selectionLabels?.[s.selectionKey] ?? s.selectionKey}
          </span>
        ))}
      </div>
    </div>
  );
}

function computeChart(series: Series[]) {
  const filtered = series.filter((s) => s.points.length > 1);
  if (filtered.length === 0) return null;

  let tMin = Infinity;
  let tMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of filtered) {
    for (const p of s.points) {
      const t = new Date(p.t).getTime();
      if (Number.isNaN(t)) continue;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (p.odds < yMin) yMin = p.odds;
      if (p.odds > yMax) yMax = p.odds;
    }
  }
  if (!Number.isFinite(tMin) || tMin === tMax) return null;
  if (yMin === yMax) {
    yMin -= 0.05;
    yMax += 0.05;
  }

  const width = 300;
  const height = 80;
  const pad = 4;
  const xw = width - pad * 2;
  const yh = height - pad * 2;
  const paths = filtered.map((s) => {
    const cmds = s.points
      .map((p, i) => {
        const t = new Date(p.t).getTime();
        const x = pad + ((t - tMin) / (tMax - tMin)) * xw;
        const y = pad + (1 - (p.odds - yMin) / (yMax - yMin)) * yh;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return cmds;
  });

  return { width, height, paths, yMin, yMax, series: filtered };
}
