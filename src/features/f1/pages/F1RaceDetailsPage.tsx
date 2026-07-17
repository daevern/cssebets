import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Flag, ArrowLeft, Clock, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getF1Race, placeF1RaceBet } from "../f1.functions";

type Selected = { marketId: string; label: string; odds: number; marketType: string } | null;
type MarketTab = "race_winner" | "podium" | "points_finish" | "head_to_head";

const TAB_LABELS: Record<MarketTab, { title: string; question: string; subtitle: string }> = {
  race_winner: {
    title: "Race winner",
    question: "Who wins the race?",
    subtitle: "First across the line takes it all.",
  },
  podium: {
    title: "Podium finish",
    question: "Which drivers finish top-3?",
    subtitle: "Champagne moments — P1, P2 or P3.",
  },
  points_finish: {
    title: "Points finish",
    question: "Who finishes in the top-10?",
    subtitle: "Any driver in P1–P10 pays out.",
  },
  head_to_head: {
    title: "Teammate H2H",
    question: "Which teammate finishes ahead?",
    subtitle: "Head-to-head duel within each garage.",
  },
};

function timeToRace(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "Started";
  const days = Math.floor(ms / (24 * 3600_000));
  const hours = Math.floor((ms % (24 * 3600_000)) / 3600_000);
  if (days > 1) return `${days}d ${hours}h`;
  if (days === 1) return `1d ${hours}h`;
  const mins = Math.floor((ms % 3600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function computeProbabilities(markets: any[]): Record<string, number> {
  const invSum = markets.reduce((s, m) => s + 1 / Number(m.odds), 0) || 1;
  const out: Record<string, number> = {};
  for (const m of markets) out[m.id] = (1 / Number(m.odds)) / invSum;
  return out;
}

export function F1RaceDetailsPage({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const place = useServerFn(placeF1RaceBet);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["f1-race", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    refetchInterval: 30_000,
  });

  const [tab, setTab] = useState<MarketTab>("race_winner");
  const [selected, setSelected] = useState<Selected>(null);
  const [stake, setStake] = useState("100");

  const grouped = useMemo(() => {
    const g: Record<MarketTab, any[]> = { race_winner: [], podium: [], points_finish: [], head_to_head: [] };
    for (const m of q.data?.markets ?? []) (g[m.market_type as MarketTab] ??= []).push(m);
    for (const k of Object.keys(g) as MarketTab[]) g[k].sort((a, b) => Number(a.odds) - Number(b.odds));
    return g;
  }, [q.data]);

  const currentMarkets = grouped[tab];
  const probabilities = useMemo(() => computeProbabilities(currentMarkets), [currentMarkets]);

  const placeMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      return place({
        data: { marketId: selected.marketId, stake: Number(stake), maxOdds: selected.odds * 1.05 },
      });
    },
    onSuccess: () => {
      toast.success("Bet placed");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["f1-race", raceId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!q.data?.race) return <div className="p-6 text-center text-sm">Race not found.</div>;

  const race: any = q.data.race;
  const startsAt = new Date(race.starts_at);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-40">
      <Link to="/f1" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All races
      </Link>

      {/* Race header — Kalshi-style event card */}
      <Card className="mb-5 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Flag className="h-3.5 w-3.5" /> Round {race.round} · Formula 1
        </div>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{race.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{race.circuit ?? "TBA"} · {race.country ?? "—"}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{startsAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          {race.status !== "finished" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
              Lights out in {timeToRace(race.starts_at)}
            </span>
          )}
        </div>
      </Card>

      {/* Market tabs */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as MarketTab[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k)}
            className="whitespace-nowrap"
          >
            {TAB_LABELS[k].title}
            <span className="ml-1.5 rounded-full bg-background/40 px-1.5 text-[10px] font-mono">
              {grouped[k].length}
            </span>
          </Button>
        ))}
      </div>

      {/* Kalshi-style question header */}
      <div className="mb-3">
        <div className="text-lg font-bold">{TAB_LABELS[tab].question}</div>
        <div className="text-xs text-muted-foreground">{TAB_LABELS[tab].subtitle}</div>
      </div>

      {/* Market list — probability-forward rows */}
      <div className="space-y-1.5">
        {currentMarkets.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No markets in this category yet.
          </Card>
        )}
        {currentMarkets.map((m: any, i: number) => {
          const pct = (probabilities[m.id] ?? 0) * 100;
          const isSelected = selected?.marketId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setSelected({
                  marketId: m.id,
                  label: m.label,
                  odds: Number(m.odds),
                  marketType: m.market_type,
                })
              }
              className={`group relative w-full overflow-hidden rounded-lg border bg-card p-3 text-left transition ${
                isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
              }`}
            >
              {/* probability fill bar */}
              <div
                className="absolute inset-y-0 left-0 bg-primary/10 transition-all"
                style={{ width: `${Math.max(2, pct)}%` }}
                aria-hidden
              />
              <div className="relative flex items-center gap-3">
                <div className="w-6 text-center text-xs font-mono font-semibold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.label}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 text-right text-[11px] font-mono font-semibold text-muted-foreground">
                      {pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Yes</div>
                  <div className="font-mono text-lg font-bold text-foreground">
                    {Number(m.odds).toFixed(2)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bet slip */}
      {selected && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {selected.marketType.replace(/_/g, " ")}
                </div>
                <div className="truncate text-sm font-semibold">{selected.label}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Odds</div>
                <div className="font-mono text-lg font-bold">{selected.odds.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Stake"
                className="text-base"
              />
              <Button onClick={() => placeMut.mutate()} disabled={placeMut.isPending} className="min-w-[140px]">
                {placeMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Bet · Win {(Number(stake) * selected.odds).toFixed(0)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
