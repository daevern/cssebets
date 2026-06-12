import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMatchMarkets, placeMarketBet } from "@/lib/markets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MARKET_LABELS,
  selectionLabel,
  CORRECT_SCORES,
  HTFT_OPTIONS,
  EXACT_GOALS_OPTIONS,
  type MarketKey,
} from "@/lib/markets-catalog";

type OddsRow = { id: string; market: string; selection: string; odds: number };

export function MarketTabs({ matchId, locked }: { matchId: string; locked: boolean }) {
  const fn = useServerFn(getMatchMarkets);
  const place = useServerFn(placeMarketBet);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["match-markets", matchId],
    queryFn: () => fn({ data: { matchId } }),
    enabled: !locked,
  });

  const grouped = useMemo(() => {
    const g: Record<MarketKey, OddsRow[]> = {
      over_under_2_5: [], btts: [], correct_score: [],
      half_time_full_time: [], exact_total_goals: [],
    };
    for (const o of (data?.odds ?? []) as OddsRow[]) {
      if (o.market in g) g[o.market as MarketKey].push(o);
    }
    return g;
  }, [data]);

  const [stake, setStake] = useState("50");
  const [pick, setPick] = useState<{ market: MarketKey; selection: string; odds: number } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Select an option");
      const n = Number(stake);
      if (!Number.isFinite(n) || n < 50) throw new Error("Minimum stake is 50 points");
      return place({
        data: {
          matchId,
          market: pick.market,
          selection: pick.selection,
          stake: n,
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Bet placed");
      setPick(null);
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (locked) return null;
  if (isLoading) {
    return <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading markets…</div>;
  }

  const hasHtFt = grouped.half_time_full_time.length > 0;

  const orderedSelections = (market: MarketKey, rows: OddsRow[]) => {
    const order =
      market === "correct_score" ? CORRECT_SCORES :
      market === "half_time_full_time" ? HTFT_OPTIONS :
      market === "exact_total_goals" ? EXACT_GOALS_OPTIONS :
      market === "over_under_2_5" ? ["OVER_2_5","UNDER_2_5"] :
      market === "btts" ? ["YES","NO"] : [];
    const byKey = new Map(rows.map(r => [r.selection, r]));
    return order.map(s => byKey.get(s)).filter(Boolean) as OddsRow[];
  };

  const renderGrid = (market: MarketKey, cols: string) => {
    const rows = orderedSelections(market, grouped[market]);
    if (!rows.length) return <div className="text-xs text-muted-foreground">Not available.</div>;
    return (
      <div className={`grid ${cols} gap-2`}>
        {rows.map((o) => {
          const isPicked = pick?.market === market && pick?.selection === o.selection;
          return (
            <Button
              key={o.id}
              type="button"
              size="sm"
              variant={isPicked ? "default" : "outline"}
              className="flex flex-col h-auto py-2"
              onClick={() => setPick({ market, selection: o.selection, odds: Number(o.odds) })}
            >
              <span className="text-[10px] truncate max-w-full">{selectionLabel(o.selection)}</span>
              <span className="font-bold text-sm">{Number(o.odds).toFixed(2)}</span>
            </Button>
          );
        })}
      </div>
    );
  };

  const potential = pick ? (Number(stake) * pick.odds || 0).toFixed(2) : "0.00";

  return (
    <div className="space-y-3 pt-2 border-t">
      <Tabs defaultValue="goals" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="goals" className="text-xs">Goals</TabsTrigger>
          <TabsTrigger value="cs" className="text-xs">Correct Score</TabsTrigger>
          <TabsTrigger value="sp" className="text-xs" disabled={!hasHtFt}>Specials</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-3 mt-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{MARKET_LABELS.over_under_2_5}</div>
            {renderGrid("over_under_2_5", "grid-cols-2")}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{MARKET_LABELS.btts}</div>
            {renderGrid("btts", "grid-cols-2")}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{MARKET_LABELS.exact_total_goals}</div>
            {renderGrid("exact_total_goals", "grid-cols-3")}
          </div>
        </TabsContent>

        <TabsContent value="cs" className="space-y-2 mt-2">
          {renderGrid("correct_score", "grid-cols-4")}
        </TabsContent>

        <TabsContent value="sp" className="space-y-2 mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{MARKET_LABELS.half_time_full_time}</div>
          {renderGrid("half_time_full_time", "grid-cols-3")}
        </TabsContent>
      </Tabs>

      {pick && (
        <div className="space-y-2 p-3 rounded-md bg-muted/40 border">
          <div className="text-xs">
            <span className="font-semibold">{MARKET_LABELS[pick.market]}</span>
            {" · "}{selectionLabel(pick.selection)}
            {" · "}@ <span className="font-mono font-bold">{pick.odds.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number" min={50} value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Stake (min 50)"
            />
            <Button
              disabled={mut.isPending || Number(stake) < 50}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "..." : `Bet → ${potential}`}
            </Button>
          </div>
          {Number(stake) < 50 && (
            <div className="text-[10px] text-destructive">Minimum stake is 50 points.</div>
          )}
        </div>
      )}
    </div>
  );
}
