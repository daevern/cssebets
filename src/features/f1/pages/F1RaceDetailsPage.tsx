import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ArrowLeft, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getF1Race, placeF1RaceBet, getF1MarketHistories } from "../f1.functions";

type TopTab = "top_finishers" | "race_specials";
type SubTab =
  | "race_winner"
  | "podium"
  | "points_finish"
  | "head_to_head";
type Range = "1D" | "1W" | "1M" | "ALL";

const RANGE_HOURS: Record<Range, number> = {
  "1D": 24,
  "1W": 24 * 7,
  "1M": 24 * 30,
  ALL: 24 * 365,
};

const SUB_TABS_TOP: { id: SubTab; label: string }[] = [
  { id: "race_winner", label: "Finishing Position" },
  { id: "podium", label: "Podium Finishers" },
  { id: "points_finish", label: "Top 10 Finishers" },
];

const SUB_TABS_SPECIALS: { id: SubTab; label: string }[] = [
  { id: "head_to_head", label: "Teammate H2H" },
];

const SECTION_TITLES: Partial<Record<SubTab, string>> = {
  race_winner: "Who wins the race?",
  podium: "Who will finish top 3?",
  points_finish: "Who will finish in the points?",
  head_to_head: "Which teammate finishes ahead?",
};

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

/** Compact multi-line SVG chart, Kalshi-style. */
function MarketMovementChart({
  series,
  height = 180,
}: {
  series: { id: string; label: string; color: string; points: { t: number; y: number }[]; last: number }[];
  height?: number;
}) {
  const filled = series.filter((s) => s.points.length > 0);
  if (filled.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground"
        style={{ height }}
      >
        No market movement recorded yet.
      </div>
    );
  }
  const allT = filled.flatMap((s) => s.points.map((p) => p.t));
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);
  const tSpan = Math.max(1, tMax - tMin);
  const yMax = Math.min(100, Math.max(20, Math.ceil(Math.max(...filled.flatMap((s) => s.points.map((p) => p.y))) / 10) * 10 + 5));
  const W = 100; // viewBox width in %
  const H = height;
  const padR = 14; // room for the % label
  const padL = 1;
  const innerW = W - padR - padL;

  const x = (t: number) => padL + ((t - tMin) / tSpan) * innerW;
  const y = (v: number) => H - (v / yMax) * (H - 12) - 6;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        {/* baseline dots */}
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={0}
            x2={W}
            y1={H - r * (H - 12) - 6}
            y2={H - r * (H - 12) - 6}
            stroke="currentColor"
            className="text-border/40"
            strokeDasharray="0.5 1.5"
            strokeWidth={0.15}
          />
        ))}
        {filled.map((s) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(2)} ${y(p.y).toFixed(2)}`)
            .join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
              <circle cx={x(last.t)} cy={y(last.y)} r={0.8} fill={s.color} />
            </g>
          );
        })}
      </svg>
      {/* Right-edge % labels */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-24 flex-col justify-between py-2">
        {filled
          .slice()
          .sort((a, b) => b.last - a.last)
          .slice(0, 2)
          .map((s) => (
            <div key={s.id} className="text-right leading-tight">
              <div className="text-[11px] font-semibold" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="text-lg font-bold tabular-nums" style={{ color: s.color }}>
                {Math.round(s.last)}%
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function F1RaceDetailsPage({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const getHistories = useServerFn(getF1MarketHistories);
  const place = useServerFn(placeF1RaceBet);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["f1-race", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    refetchInterval: 30_000,
  });

  const [topTab, setTopTab] = useState<TopTab>("top_finishers");
  const [subTab, setSubTab] = useState<SubTab>("race_winner");
  const [range, setRange] = useState<Range>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(100);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Reset subtab when top-tab flips
    setSubTab(topTab === "top_finishers" ? "race_winner" : "head_to_head");
    setSelectedId(null);
  }, [topTab]);

  const race: any = q.data?.race;
  const drivers: any[] = q.data?.drivers ?? [];
  const teams: any[] = q.data?.teams ?? [];
  const teamByKey = useMemo(() => Object.fromEntries(teams.map((t) => [t.team_key, t])), [teams]);
  const driverByKey = useMemo(() => Object.fromEntries(drivers.map((d) => [d.driver_key, d])), [drivers]);

  const grouped = useMemo(() => {
    const g: Record<SubTab, any[]> = { race_winner: [], podium: [], points_finish: [], head_to_head: [] };
    for (const m of q.data?.markets ?? []) (g[m.market_type as SubTab] ??= []).push(m);
    for (const k of Object.keys(g) as SubTab[]) g[k].sort((a, b) => Number(a.odds) - Number(b.odds));
    return g;
  }, [q.data]);

  const currentMarkets = grouped[subTab];
  const probabilities = useMemo(() => computeProbabilities(currentMarkets), [currentMarkets]);

  // Top-2 for the chart (based on current subtab)
  const chartMarkets = useMemo(() => currentMarkets.slice(0, 2), [currentMarkets]);
  const chartIds = chartMarkets.map((m) => m.id);

  const chartQ = useQuery({
    queryKey: ["f1-histories", chartIds.join(","), range],
    queryFn: () => getHistories({ data: { marketIds: chartIds, rangeHours: RANGE_HOURS[range] } }),
    enabled: chartIds.length > 0,
    refetchInterval: 60_000,
  });

  const chartColors = ["hsl(var(--primary))", "hsl(198 90% 60%)"];
  const chartSeries = useMemo(() => {
    if (!chartQ.data) return [];
    return chartMarkets.map((m, i) => {
      const raw = chartQ.data!.byMarket[m.id] ?? [];
      const points = raw.map((p) => ({ t: new Date(p.snapshot_at).getTime(), y: oddsToPct(Number(p.odds)) }));
      // Anchor with current odds if history is empty/sparse
      const currentPct = oddsToPct(Number(m.odds));
      if (points.length === 0) {
        const now = Date.now();
        points.push({ t: now - RANGE_HOURS[range] * 3600_000, y: currentPct });
        points.push({ t: now, y: currentPct });
      } else {
        points.push({ t: Date.now(), y: currentPct });
      }
      return {
        id: m.id,
        label: shortLabel(m.label),
        color: chartColors[i] ?? "hsl(var(--muted-foreground))",
        points,
        last: currentPct,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartQ.data, chartMarkets, range]);

  const totalVolume = useMemo(() => {
    // Placeholder: volume derived from open markets count until we track true volume
    return (currentMarkets.length * 1247).toLocaleString();
  }, [currentMarkets]);

  const placeMut = useMutation({
    mutationFn: async () => {
      const m = currentMarkets.find((x) => x.id === selectedId);
      if (!m) throw new Error("No selection");
      return place({
        data: { marketId: m.id, stake: Number(stake), maxOdds: Number(m.odds) * 1.05 },
      });
    },
    onSuccess: () => {
      toast.success("Bet placed");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["f1-race", raceId] });
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

  const filteredMarkets = search
    ? currentMarkets.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()))
    : currentMarkets;

  const selectedMarket = currentMarkets.find((x) => x.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-4">
      <Link
        to="/f1"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All races
      </Link>

      {/* Header */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          F1 · Round {race.round}
        </div>
        <h1 className="text-3xl font-black leading-[1.05] tracking-tight">
          {race.name} Main Race Winner?
        </h1>
        <div className="mt-3 text-sm text-muted-foreground">{formatBegin(race.starts_at)}</div>
      </div>

      {/* Chart */}
      <div className="mb-2 pt-2 text-primary/70">
        <MarketMovementChart series={chartSeries} />
      </div>

      {/* Volume + timeframe */}
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3 pt-2">
        <div className="text-xs font-semibold text-muted-foreground">
          <span className="text-foreground">${totalVolume}</span> vol
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? "text-foreground"
                  : "text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Driver leaderboard (current subtab) */}
      <div className="mb-8 divide-y divide-border/60">
        {filteredMarkets.slice(0, subTab === "race_winner" ? 3 : 5).map((m: any) => {
          const drv = driverByKey[m.selection_key];
          const team = drv?.team_key ? teamByKey[drv.team_key] : null;
          const pct = probabilities[m.id] * 100;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={`flex w-full items-center gap-3 py-3 text-left transition ${
                selectedId === m.id ? "" : ""
              }`}
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                {drv?.photo_url ? (
                  <img src={drv.photo_url} alt={m.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs font-bold text-muted-foreground">
                    {(drv?.abbr ?? m.label.slice(0, 3)).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{drv?.name ?? m.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {team?.name ?? shortLabel(m.label, true)}
                </div>
              </div>
              <div className="tabular-nums text-2xl font-bold">
                {pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%
              </div>
            </button>
          );
        })}
      </div>

      {/* Top tabs: Top Finishers / Race Specials */}
      <div className="mb-6 flex items-baseline gap-6">
        {(
          [
            { id: "top_finishers", label: "Top Finishers" },
            { id: "race_specials", label: "Race Specials" },
          ] as { id: TopTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className={`text-2xl font-bold transition-colors ${
              topTab === t.id ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            /* opens search input focus */
            const el = document.getElementById("f1-search");
            el?.focus();
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" /> Search
        </button>
        {(topTab === "top_finishers" ? SUB_TABS_TOP : SUB_TABS_SPECIALS).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              subTab === t.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search input (hidden until user types or focuses) */}
      <div className="mb-4">
        <input
          id="f1-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drivers…"
          className="w-full rounded-full border border-border bg-transparent px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {/* Section title */}
      {SECTION_TITLES[subTab] && (
        <div className="mb-3 text-lg font-semibold">{SECTION_TITLES[subTab]}</div>
      )}

      {/* Full market list */}
      <div className="divide-y divide-border/60">
        {filteredMarkets.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No markets in this category yet.
          </div>
        )}
        {filteredMarkets.map((m: any) => {
          const drv = driverByKey[m.selection_key];
          const team = drv?.team_key ? teamByKey[drv.team_key] : null;
          const pct = probabilities[m.id] * 100;
          const isSel = selectedId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={`flex w-full items-center gap-3 py-3 text-left transition ${
                isSel ? "bg-primary/5" : ""
              }`}
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                {drv?.photo_url ? (
                  <img src={drv.photo_url} alt={m.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[10px] font-bold text-muted-foreground">
                    {(drv?.abbr ?? m.label.slice(0, 3)).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{drv?.name ?? m.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {team?.name ?? shortLabel(m.label, true)}
                </div>
              </div>
              <div className="tabular-nums text-lg font-bold">
                {pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%
              </div>
            </button>
          );
        })}
      </div>

      {/* Important info */}
      <div className="mt-10 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <span className="font-bold">Important information:</span>{" "}
        <span className="text-muted-foreground">
          F1 races will be paid out after the &lsquo;Final Race Classification&rsquo; has been posted by the FIA.
        </span>
      </div>

      {/* Bet slip with Kalshi-style slider */}
      {selectedMarket && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your position
                </div>
                <div className="truncate text-sm font-semibold">
                  {driverByKey[selectedMarket.selection_key]?.name ?? selectedMarket.label}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Odds</div>
                <div className="font-mono text-lg font-bold">{Number(selectedMarket.odds).toFixed(2)}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Stake</span>
                <span className="font-mono text-base font-bold">{stake} pts</span>
              </div>
              <Slider
                value={[stake]}
                min={10}
                max={5000}
                step={10}
                onValueChange={(v) => setStake(v[0])}
                className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
              />
              <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>10</span>
                <span>1000</span>
                <span>5000</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Potential win</span>
              <span className="font-mono text-base font-bold text-primary">
                {(stake * Number(selectedMarket.odds)).toFixed(0)} pts
              </span>
            </div>

            <Button
              onClick={() => placeMut.mutate()}
              disabled={placeMut.isPending}
              className="w-full rounded-full py-6 text-base font-bold"
            >
              {placeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place bet
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function shortLabel(s: string, sub = false) {
  if (!sub) return s.length > 22 ? s.slice(0, 22) + "…" : s;
  return s;
}
