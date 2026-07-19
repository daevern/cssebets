import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, ArrowLeft, ArrowUpRight, X, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Customized,
} from "recharts";
import { getF1Race, placeF1RaceBet, getF1MarketHistories } from "../f1.functions";
import { getMyWallet } from "@/lib/wallet.functions";
import { useAuth } from "@/hooks/use-auth";
import { PageFooter } from "@/components/ui/page-footer";

type TopTab = "top_finishers" | "race_specials";
type SubTab =
  | "top_5_finish"
  | "podium"
  | "points_finish"
  | "head_to_head"
  | "fastest_lap"
  | "top_constructor_race";
type Range = "1D" | "1W" | "1M" | "ALL";

const RANGE_HOURS: Record<Range, number> = {
  "1D": 24,
  "1W": 24 * 7,
  "1M": 24 * 30,
  ALL: 24 * 365,
};

const SUB_TABS_TOP: { id: SubTab; label: string }[] = [
  { id: "top_5_finish", label: "Top 5 Finishers" },
  { id: "podium", label: "Podium Finishers" },
  { id: "points_finish", label: "Top 10 Finishers" },
];

const SUB_TABS_SPECIALS: { id: SubTab; label: string }[] = [
  { id: "head_to_head", label: "Teammate H2H" },
  { id: "fastest_lap", label: "Fastest Lap" },
  { id: "top_constructor_race", label: "Top Constructor" },
];

const SECTION_TITLES: Partial<Record<SubTab, string>> = {
  top_5_finish: "Who will finish top 5?",
  podium: "Who will finish top 3?",
  points_finish: "Who will finish in the points?",
  head_to_head: "Which teammate finishes ahead?",
  fastest_lap: "Who sets the fastest lap?",
  top_constructor_race: "Which team scores the most points?",
};

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

const CHART_PALETTE = [
  "#22C55E",
  "#3B82F6",
  "#EC4899",
  "#F59E0B",
  "#A78BFA",
  "#FB7185",
  "#38BDF8",
  "#F97316",
];

function computeProbabilities(markets: any[]): Record<string, number> {
  const invSum = markets.reduce((s, m) => s + 1 / Number(m.odds), 0) || 1;
  const out: Record<string, number> = {};
  for (const m of markets) out[m.id] = 1 / Number(m.odds) / invSum;
  return out;
}

function oddsToPct(o: number) {
  if (!o || o <= 1) return 0;
  return Math.min(100, Math.max(0, (1 / o) * 100));
}

function formatBegin(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff < 0) return `Started · ${dateStr}, ${timeStr}`;
  if (diff < 24 * 3600_000) return `Today · ${timeStr}`;
  return `Begins on ${weekday} · ${dateStr}, ${timeStr}`;
}

function impliedPct(odds: number) {
  if (!odds || odds <= 1) return 0;
  return Math.round((1 / odds) * 100);
}

export function F1RaceDetailsPage({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const getHistories = useServerFn(getF1MarketHistories);
  const place = useServerFn(placeF1RaceBet);
  const walletFn = useServerFn(getMyWallet);
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["f1-race", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    refetchInterval: 30_000,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id,
    staleTime: 15_000,
  });
  const balance = Number(wallet.data?.balance ?? 0);

  const [topTab, setTopTab] = useState<TopTab>("top_finishers");
  const [subTab, setSubTab] = useState<SubTab>("top_5_finish");
  const [range, setRange] = useState<Range>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stake, setStake] = useState<string>("100");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setSubTab(topTab === "top_finishers" ? "top_5_finish" : "head_to_head");
    setSelectedId(null);
    setHidden({});
    setActiveIndex(null);
  }, [topTab]);

  useEffect(() => {
    setSelectedId(null);
    setHidden({});
    setActiveIndex(null);
  }, [subTab]);

  const race: any = q.data?.race;
  const drivers: any[] = q.data?.drivers ?? [];
  const teams: any[] = q.data?.teams ?? [];
  const teamByKey = useMemo(() => Object.fromEntries(teams.map((t) => [t.team_key, t])), [teams]);
  const driverByKey = useMemo(() => Object.fromEntries(drivers.map((d) => [d.driver_key, d])), [drivers]);

  const grouped = useMemo(() => {
    const g: Record<SubTab, any[]> = {
      top_5_finish: [],
      podium: [],
      points_finish: [],
      head_to_head: [],
      fastest_lap: [],
      top_constructor_race: [],
    };
    for (const m of q.data?.markets ?? []) (g[m.market_type as SubTab] ??= []).push(m);
    for (const k of Object.keys(g) as SubTab[]) g[k].sort((a, b) => Number(a.odds) - Number(b.odds));
    return g;
  }, [q.data]);

  const currentMarkets = grouped[subTab];
  const probabilities = useMemo(() => computeProbabilities(currentMarkets), [currentMarkets]);

  // Top ~6 for the chart. Each becomes a filterable series.
  const chartMarkets = useMemo(() => currentMarkets.slice(0, 6), [currentMarkets]);
  const chartIds = chartMarkets.map((m) => m.id);

  const chartQ = useQuery({
    queryKey: ["f1-histories", chartIds.join(","), range],
    queryFn: () => getHistories({ data: { marketIds: chartIds, rangeHours: RANGE_HOURS[range] } }),
    enabled: chartIds.length > 0,
    refetchInterval: 60_000,
  });

  // Seed the legend to show only the top 3 favourites by default whenever the
  // market set changes (subTab switch or fresh race data). User toggles after
  // that are preserved until the next reset.
  const chartIdsKey = chartIds.join(",");
  useEffect(() => {
    if (chartIds.length === 0) return;
    const next: Record<string, boolean> = {};
    chartIds.forEach((id, idx) => {
      if (idx >= 3) next[id] = true;
    });
    setHidden(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartIdsKey]);

  const seriesMeta = useMemo(
    () =>
      chartMarkets.map((m: any, i) => {
        const drv = driverByKey[m.selection_key];
        return {
          id: m.id as string,
          key: `k_${m.id}`,
          label: drv?.name ?? m.label,
          short: (drv?.abbr ?? m.label).toString().slice(0, 3).toUpperCase(),
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          currentPct: impliedPct(Number(m.odds)),
        };
      }),
    [chartMarkets, driverByKey],
  );

  // Build per-series points restricted to the selected range, then merge onto shared timeline.
  const { chartData, yDomain } = useMemo(() => {
    const byMarket = chartQ.data?.byMarket ?? {};
    const now = Date.now();
    const windowMs = RANGE_HOURS[range] * 3600_000;

    const perSeries: Record<string, { t: number; y: number }[]> = {};
    for (const s of seriesMeta) {
      const raw = (byMarket[s.id] ?? [])
        .map((p: any) => ({ t: new Date(p.snapshot_at).getTime(), y: oddsToPct(Number(p.odds)) }))
        .sort((a: any, b: any) => a.t - b.t);

      const cutoff = range === "ALL" ? -Infinity : now - windowMs;
      const inWin = raw.filter((p) => p.t >= cutoff);

      // Anchor at cutoff with the last-known value before the window so the line doesn't jump in.
      const before = raw.filter((p) => p.t < cutoff).at(-1);
      const anchor = range !== "ALL" && before ? [{ t: cutoff, y: before.y }] : [];

      // Always end at "now" with the latest observed value (or current price if no history at all).
      const latest = inWin.at(-1) ?? before ?? { t: now, y: s.currentPct };
      const tail = { t: now, y: latest.y };

      const merged = [...anchor, ...inWin];
      if (merged.length === 0) merged.push({ t: cutoff === -Infinity ? now - 3600_000 : cutoff, y: s.currentPct });
      if (merged[merged.length - 1].t < now) merged.push(tail);
      perSeries[s.id] = merged;
    }

    // Merge on a shared timeline with forward-fill.
    const times = new Set<number>();
    for (const arr of Object.values(perSeries)) for (const p of arr) times.add(p.t);
    const sortedT = [...times].sort((a, b) => a - b);
    const cursors: Record<string, number> = {};
    const last: Record<string, number> = {};
    const rows: Record<string, number | string>[] = [];
    for (const t of sortedT) {
      const row: Record<string, number | string> = { t };
      for (const s of seriesMeta) {
        const arr = perSeries[s.id] ?? [];
        let idx = cursors[s.id] ?? 0;
        while (idx < arr.length && arr[idx].t <= t) {
          last[s.id] = arr[idx].y;
          idx++;
        }
        cursors[s.id] = idx;
        if (last[s.id] != null) row[s.key] = last[s.id];
      }
      rows.push(row);
    }

    // y domain padded around the visible values so movement reads clearly.
    const values: number[] = [];
    for (const r of rows) for (const s of seriesMeta) {
      const v = r[s.key];
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
    let domain: [number, number] = [0, 100];
    if (values.length) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const spread = Math.max(max - min, 4);
      const pad = spread * 0.35;
      domain = [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))];
    }
    return { chartData: rows, yDomain: domain };
  }, [chartQ.data, seriesMeta, range]);

  const visibleSeries = seriesMeta.filter((s) => !hidden[s.id]);
  const scrubIdx = activeIndex != null ? activeIndex : Math.max(0, chartData.length - 1);
  const splitData = useMemo(() => {
    return chartData.map((row, i) => {
      const out: Record<string, number | string> = { t: row.t as number };
      for (const s of seriesMeta) {
        const v = row[s.key];
        if (typeof v === "number") {
          if (i <= scrubIdx) out[`${s.key}__a`] = v;
          if (i >= scrubIdx) out[`${s.key}__d`] = v;
        }
      }
      return out;
    });
  }, [chartData, seriesMeta, scrubIdx]);


  const placeMut = useMutation({
    mutationFn: async () => {
      const m = currentMarkets.find((x) => x.id === selectedId);
      if (!m) throw new Error("No selection");
      const n = Number(stake);
      if (!Number.isFinite(n) || n < MIN_STAKE) throw new Error(`Minimum stake is ${MIN_STAKE} points.`);
      if (n > MAX_STAKE) throw new Error(`Maximum stake is ${MAX_STAKE.toLocaleString()} points.`);
      if (n > balance) throw new Error("Insufficient points");
      return place({ data: { marketId: m.id, stake: n, maxOdds: Number(m.odds) * 1.05 } });
    },
    onSuccess: () => {
      toast.success("Prediction locked");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["f1-race", raceId] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading)
    return (
      <div className="p-6">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!race) return <div className="p-6 text-center text-sm">Race not found.</div>;

  const [searchState, setSearchState] = [null, null] as any; // legacy no-op
  void searchState; void setSearchState;

  const selectedMarket = currentMarkets.find((x) => x.id === selectedId) ?? null;
  const selectedDriver = selectedMarket ? driverByKey[selectedMarket.selection_key] : null;
  const stakeNum = Number(stake) || 0;
  const potentialReturn = selectedMarket ? stakeNum * Number(selectedMarket.odds) : 0;
  const potentialGain = potentialReturn - stakeNum;
  const noBalance = balance <= 0;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const stakeError =
    !Number.isFinite(stakeNum) || stakeNum < MIN_STAKE
      ? `Min ${MIN_STAKE} pts`
      : stakeNum > MAX_STAKE
      ? `Max ${MAX_STAKE.toLocaleString()} pts`
      : null;
  const canSubmit = !!selectedMarket && !placeMut.isPending && !stakeError && !noBalance && !overBalance;

  return (
    <div
      className="mx-auto max-w-3xl px-4 pt-4"
      style={{ paddingBottom: selectedMarket ? "calc(env(safe-area-inset-bottom) + 22rem)" : "3rem" }}
    >
      <Link
        to="/f1"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-3 w-3" /> All races
      </Link>

      {/* Header */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
          F1 · Round {race.round}
        </div>
        <h1 className="font-display text-3xl font-black leading-[1.05] tracking-tight text-[var(--color-ink)]">
          {race.name}
        </h1>
        <div className="mt-3 text-sm text-[var(--color-ink-muted)]">{formatBegin(race.starts_at)}</div>
      </div>

      {/* Market Movement — recharts, football-analytics style */}
      <section className="relative -mx-4 bg-[var(--color-surface)] md:mx-0">
        <div className="px-4 pt-5 md:px-6 md:pt-6">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-white md:text-[26px]">
            {SECTION_TITLES[subTab] ?? "Market movement"}
          </h2>

          {/* Driver selector — collapsed dropdown; click a chip to toggle on/off */}
          <DriverLegendDropdown
            series={seriesMeta}
            hidden={hidden}
            onToggle={(id) => setHidden((h) => ({ ...h, [id]: !h[id] }))}
            onAll={() => setHidden({})}
            onNone={() => setHidden(Object.fromEntries(seriesMeta.map((s) => [s.id, true])))}
          />

        </div>

        <div className="relative mt-3 h-[300px] w-full sm:h-[340px] md:h-[380px]">
          {chartQ.isLoading ? (
            <div className="grid h-full place-items-center text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
              Loading market history…
            </div>
          ) : chartData.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-[var(--color-ink-muted)]">
              No market movement recorded yet.
            </div>
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
                <CartesianGrid strokeDasharray="3 6" stroke="#ffffff" strokeOpacity={0.28} vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke="#ffffff"
                  strokeOpacity={0.15}
                  tick={false}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  minTickGap={48}
                />
                <YAxis hide domain={yDomain} width={0} padding={{ top: 0, bottom: 0 }} />
                <Tooltip
                  content={() => null}
                  cursor={{ stroke: "rgba(255,255,255,0.28)", strokeWidth: 1, strokeDasharray: "3 4" }}
                />
                {visibleSeries.map((s) => (
                  <Line
                    key={`${s.id}-dim`}
                    type="linear"
                    dataKey={`${s.key}__d`}
                    stroke={s.color}
                    strokeOpacity={0.22}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
                {visibleSeries.map((s) => (
                  <Line
                    key={`${s.id}-active`}
                    type="linear"
                    dataKey={`${s.key}__a`}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
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
                        {visibleSeries.map((s) => {
                          const raw = row[s.key];
                          const v = typeof raw === "number" ? raw : Number(raw);
                          if (!Number.isFinite(v)) return null;
                          const y = yScale(v);
                          const xAxis = Object.values(cprops.xAxisMap ?? {})[0] as any;
                          const xScale = xAxis?.scale;
                          const cx = xScale ? xScale(row.t) : rightX;
                          return (
                            <g key={`ep-${s.id}`}>
                              <circle cx={cx} cy={y} r={4.5} fill={s.color} />
                              <circle cx={cx} cy={y} r={9} fill={s.color} opacity={0.18} />
                              <text
                                x={rightX + 6}
                                y={y - 4}
                                fill={s.color}
                                fontSize={13}
                                fontWeight={800}
                                style={{ letterSpacing: "0.02em" }}
                              >
                                {s.short}
                              </text>
                              <text
                                x={rightX + 6}
                                y={y + 12}
                                fill={s.color}
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

        {/* Range selector — spans the chart width, aligned with the x-axis */}
        <div className="mt-2 w-full pl-4 pr-[84px] md:pl-6">
          <div className="flex items-center justify-between">
            {(Object.keys(RANGE_HOURS) as Range[]).map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium tracking-tight transition-colors ${
                    active ? "text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mb-4 mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-surface-border)] to-transparent" />


      {/* Top tabs */}
      <div className="mb-4 flex items-baseline gap-6">
        {(
          [
            { id: "top_finishers", label: "Top Finishers" },
            { id: "race_specials", label: "Race Specials" },
          ] as { id: TopTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className={`text-lg font-bold transition-colors ${
              topTab === t.id ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]/60 hover:text-[var(--color-ink-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs — segmented bar (matches UFC / football MarketTabs) */}
      <div className="mb-6 -mx-4 md:mx-0">
        <div
          role="tablist"
          aria-label="Market categories"
          className="flex overflow-x-auto rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(topTab === "top_finishers" ? SUB_TABS_TOP : SUB_TABS_SPECIALS).map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(t.id)}
                className={`shrink-0 flex-1 px-4 py-2.5 text-center text-[13px] font-semibold whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)]/60 last:border-r-0 ${
                  active
                    ? "bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[inset_0_-2px_0_0_var(--color-neon)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>


      {/* Full market list */}
      <div className="divide-y divide-[var(--color-surface-border)]/60">
        {currentMarkets.length === 0 && (
          <div className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
            No markets in this category yet.
          </div>
        )}

        {subTab === "head_to_head" ? (
          (() => {
            // Group the two rows of each pairing (A-beats-B, B-beats-A) into one card.
            const pairs = new Map<string, { yes: any; no: any }>();
            for (const m of currentMarkets) {
              const a = m.selection_key as string;
              const b = m.secondary_selection_key as string;
              if (!a || !b) continue;
              const key = [a, b].sort().join("|");
              const bucket = pairs.get(key) ?? ({} as { yes: any; no: any });
              // Favorite (lowest odds) becomes the "yes" side so the question reads naturally.
              if (!bucket.yes || Number(m.odds) < Number(bucket.yes.odds)) {
                if (bucket.yes) bucket.no = bucket.yes;
                bucket.yes = m;
              } else {
                bucket.no = m;
              }
              pairs.set(key, bucket);
            }
            const list = [...pairs.values()].filter((p) => p.yes && p.no);
            return list.map(({ yes, no }) => {
              const drvA = driverByKey[yes.selection_key];
              const drvB = driverByKey[yes.secondary_selection_key];
              const teamA = drvA?.team_key ? teamByKey[drvA.team_key] : null;
              const nameA = drvA?.name ?? yes.selection_key;
              const nameB = drvB?.name ?? yes.secondary_selection_key;
              const yesSel = selectedId === yes.id;
              const noSel = selectedId === no.id;
              return (
                <div key={yes.id} className="py-3">
                  {teamA?.name && (
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      {teamA.name}
                    </div>
                  )}
                  <div className="mb-2.5 text-sm font-semibold text-[var(--color-ink)]">
                    Will {nameA} beat {nameB}?
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(yes.id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 bg-black/40 px-3 py-4 transition ${
                        yesSel
                          ? "border-sky-500 ring-2 ring-sky-500/60 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
                          : "border-[var(--color-surface-border)] hover:border-sky-500/60"
                      }`}
                    >
                      <span className="text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">
                        Yes
                      </span>
                      <span className="font-display text-2xl font-black tabular-nums text-[var(--color-neon)]">
                        {Number(yes.odds).toFixed(2)}
                        <span className="text-base">x</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedId(no.id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 bg-black/40 px-3 py-4 transition ${
                        noSel
                          ? "border-red-500 ring-2 ring-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                          : "border-[var(--color-surface-border)] hover:border-red-500/60"
                      }`}
                    >
                      <span className="text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">
                        No
                      </span>
                      <span className="font-display text-2xl font-black tabular-nums text-[var(--color-neon)]">
                        {Number(no.odds).toFixed(2)}
                        <span className="text-base">x</span>
                      </span>
                    </button>
                  </div>
                </div>
              );
            });
          })()
        ) : (
          currentMarkets.map((m: any) => {
            const isConstructor = subTab === "top_constructor_race";
            const team = isConstructor ? teamByKey[m.selection_key] : null;
            const drv = !isConstructor ? driverByKey[m.selection_key] : null;
            const drvTeam = drv?.team_key ? teamByKey[drv.team_key] : null;
            
            const isSel = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-center gap-3 py-3 text-left transition ${
                  isSel ? "bg-[var(--color-neon)]/5" : ""
                }`}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)] ring-1 ring-[var(--color-surface-border)]/60">
                  {isConstructor ? (
                    team?.logo_url ? (
                      <img src={team.logo_url} alt={m.label} className="h-full w-full object-contain p-1" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[10px] font-bold text-[var(--color-ink-muted)]">
                        {m.label.slice(0, 3).toUpperCase()}
                      </div>
                    )
                  ) : drv?.photo_url ? (
                    <img src={drv.photo_url} alt={m.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] font-bold text-[var(--color-ink-muted)]">
                      {(drv?.abbr ?? m.label.slice(0, 3)).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
                    {isConstructor ? (team?.name ?? m.label) : (drv?.name ?? m.label)}
                  </div>
                  <div className="truncate text-xs text-[var(--color-ink-muted)]">
                    {isConstructor ? "Constructor" : (drvTeam?.name ?? "")}
                  </div>
                </div>
                <div className="font-display tabular-nums text-lg font-bold text-[var(--color-neon)]">
                  {Number(m.odds).toFixed(2)}<span className="text-sm">x</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-8 rounded-lg border border-[var(--color-neon)]/30 bg-[var(--color-neon)]/5 p-4 text-sm">
        <span className="font-bold text-[var(--color-ink)]">Important information:</span>{" "}
        <span className="text-[var(--color-ink-muted)]">
          F1 races settle after the FIA posts the Final Race Classification.
        </span>
      </div>

      {/* Your position — StakeSlip-style sticky slip (matches football/world-cup) */}
      {selectedMarket && (
        <div
          className="fixed inset-x-0 z-50 mx-auto max-w-2xl space-y-2.5 rounded-t-lg border border-[var(--color-neon)]/40 bg-[#050A08]/98 p-3.5 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] backdrop-blur"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom))",
            paddingBottom: "0.875rem",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
                Your prediction
              </div>
              <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
                {race.name} · {SECTION_TITLES[subTab]}
              </div>
              <div className="text-[13px] leading-snug text-[var(--color-ink)]">
                <span className="font-semibold">{selectedDriver?.name ?? selectedMarket.label}</span>
                <span className="mx-1.5 text-[var(--color-ink-muted)]">·</span>
                <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
                  {Number(selectedMarket.odds).toFixed(2)}x
                </span>
                <span className="ml-1.5 text-[11px] text-[var(--color-ink-muted)]">
                  market estimate ~{impliedPct(Number(selectedMarket.odds))}%
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Clear selection"
              className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
              disabled={noBalance}
              placeholder={`Points (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
              className="flex-1 min-w-0 rounded-md border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => placeMut.mutate()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-border)] disabled:text-[var(--color-ink-muted)] disabled:opacity-40"
            >
              {placeMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {noBalance
                      ? "Add Points to Lock"
                      : overBalance
                      ? "Stake exceeds balance"
                      : "Lock Prediction"}
                  </span>
                  {canSubmit && <ArrowUpRight className="h-3.5 w-3.5" />}
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 px-2.5 py-1.5">
              <span className="text-[var(--color-ink-muted)]">Return</span>
              <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
                {potentialReturn.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)]/60 bg-black/40 px-2.5 py-1.5">
              <span className="text-[var(--color-ink-muted)]">Gain</span>
              <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
                +{potentialGain.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
            <span>
              Points balance:{" "}
              <span className="font-bold tabular-nums text-[var(--color-ink)]">{balance.toFixed(2)}</span>
            </span>
            {noBalance && <span className="font-semibold text-destructive">Add points to lock this prediction.</span>}
            {!noBalance && overBalance && (
              <span className="font-semibold text-destructive">Stake exceeds points balance</span>
            )}
            {!noBalance && !overBalance && stakeError && (
              <span className="font-semibold text-destructive">{stakeError}</span>
            )}
          </div>
        </div>
      )}

      <PageFooter />
    </div>
  );
}

type LegendSeries = { id: string; label: string; color: string; currentPct: number };

function DriverLegendDropdown({
  series,
  hidden,
  onToggle,
  onAll,
  onNone,
}: {
  series: LegendSeries[];
  hidden: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shownCount = series.filter((s) => !hidden[s.id]).length;

  return (
    <div className="relative mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--color-surface-border)] bg-black/40 px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)] hover:border-[var(--color-neon)]/60"
      >
        <span>Drivers on chart</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/80">
          {shownCount}/{series.length}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-lg border border-[var(--color-surface-border)] bg-[#050A08] p-2 shadow-2xl">
          <div className="mb-2 flex items-center justify-between border-b border-[var(--color-surface-border)]/60 px-1 pb-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Toggle drivers
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAll}
                className="font-semibold text-[var(--color-neon)] hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={onNone}
                className="font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {series.map((s) => {
              const on = !hidden[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white/5"
                >
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded border"
                    style={{
                      borderColor: on ? s.color : "rgba(255,255,255,0.2)",
                      background: on ? s.color : "transparent",
                    }}
                  >
                    {on && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className={`flex-1 truncate font-medium ${on ? "text-white" : "text-white/50"}`}>
                    {s.label}
                  </span>
                  <span className="font-mono text-[11px] text-white/60">{s.currentPct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

