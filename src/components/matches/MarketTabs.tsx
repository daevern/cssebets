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

  const [stakes, setStakes] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, { selection: string; odds: number } | null>>({});

  const mut = useMutation({
    mutationFn: async (market: MarketKey) => {
      const pick = picks[market];
      if (!pick) throw new Error("Select an option");
      const stakeVal = stakes[market] ?? "10";
      const n = Number(stakeVal);
      if (!Number.isFinite(n) || n < 1) throw new Error("Enter a stake of at least 1 point");
      return place({
        data: {
          matchId,
          market,
          selection: pick.selection,
          stake: n,
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (_, market) => {
      toast.success("Bet placed");
      setPicks((prev) => ({ ...prev, [market]: null }));
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

  const renderMarketSection = (market: MarketKey, cols: string) => {
    const rows = orderedSelections(market, grouped[market]);
    if (!rows.length) return <div className="text-xs text-muted-foreground">Not available.</div>;
    
    const pick = picks[market];
    const stake = stakes[market] ?? "10";
    const potential = pick ? (Number(stake) * pick.odds || 0).toFixed(2) : "0.00";
    const isPending = mut.isPending && mut.variables === market;

    return (
      <div className="space-y-2">
        <div className={`grid ${cols} gap-2`}>
          {rows.map((o) => {
            const isPicked = pick?.selection === o.selection;
            return (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={isPicked ? "default" : "outline"}
                className="flex flex-col h-auto py-2"
                onClick={() => setPicks((prev) => ({
                  ...prev,
                  [market]: isPicked ? null : { selection: o.selection, odds: Number(o.odds) }
                }))}
              >
                <span className="text-[10px] truncate max-w-full">{selectionLabel(o.selection)}</span>
                <span className="font-bold text-sm">{Number(o.odds).toFixed(2)}</span>
              </Button>
            );
          })}
        </div>

        {pick && (
          <div className="space-y-2 p-3 mt-2 rounded-md bg-muted/40 border transition-all animate-in fade-in-50 duration-200">
            <div className="text-xs flex justify-between items-center">
              <div>
                <span className="font-semibold">{MARKET_LABELS[market]}</span>
                {" · "}{selectionLabel(pick.selection)}
                {" · "}@ <span className="font-mono font-bold">{pick.odds.toFixed(2)}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-4 w-4 text-muted-foreground hover:text-foreground"
                onClick={() => setPicks((prev) => ({ ...prev, [market]: null }))}
              >
                ×
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number" min={1} value={stake}
                onChange={(e) => setStakes((prev) => ({ ...prev, [market]: e.target.value }))}
                placeholder="Stake"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                disabled={isPending || Number(stake) < 1}
                onClick={() => mut.mutate(market)}
                className="h-8 text-xs shrink-0"
              >
                {isPending ? "..." : `Bet → ${potential}`}
              </Button>
            </div>
            {Number(stake) < 1 && (
              <div className="text-[10px] text-destructive">Enter a stake of at least 1 point.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pt-2 border-t">
      <Tabs defaultValue="goals" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="goals" className="text-xs">Goals</TabsTrigger>
          <TabsTrigger value="cs" className="text-xs">Correct Score</TabsTrigger>
          <TabsTrigger value="sp" className="text-xs" disabled={!hasHtFt}>Specials</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-4 mt-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.over_under_2_5}</div>
            {renderMarketSection("over_under_2_5", "grid-cols-2")}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.btts}</div>
            {renderMarketSection("btts", "grid-cols-2")}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.exact_total_goals}</div>
            {renderMarketSection("exact_total_goals", "grid-cols-3")}
          </div>
        </TabsContent>

        <TabsContent value="cs" className="space-y-2 mt-2">
          {renderMarketSection("correct_score", "grid-cols-4")}
        </TabsContent>

        <TabsContent value="sp" className="space-y-2 mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.half_time_full_time}</div>
          {renderMarketSection("half_time_full_time", "grid-cols-3")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
