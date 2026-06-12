import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMatchMarkets, placeMarketBet } from "@/lib/markets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  MARKET_LABELS,
  selectionLabel,
  CORRECT_SCORES,
  HTFT_OPTIONS,
  EXACT_GOALS_OPTIONS,
  type MarketKey,
} from "@/lib/markets-catalog";

type OddsRow = { id: string; market: string; selection: string; odds: number };

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

export function MarketTabs({ matchId, locked }: { matchId: string; locked: boolean }) {
  const fn = useServerFn(getMatchMarkets);
  const place = useServerFn(placeMarketBet);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["match-markets", matchId],
    queryFn: () => fn({ data: { matchId } }),
    enabled: !locked,
  });

  const myBets = useQuery({
    queryKey: ["my-match-pending-bets", matchId, user?.id],
    enabled: !!user && !locked,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("market_text, selection_label")
        .eq("match_id", matchId)
        .eq("user_id", user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });

  const placedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of (myBets.data ?? []) as Array<{ market_text: string | null; selection_label: string | null }>) {
      if (b.market_text && b.selection_label) s.add(`${b.market_text}:${b.selection_label}`);
    }
    return s;
  }, [myBets.data]);

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

  // Multi-select state for Score (correct_score) — selection -> odds; one stake per selection
  const [csPicks, setCsPicks] = useState<Record<string, number>>({});
  const [csStakes, setCsStakes] = useState<Record<string, string>>({});

  const stakeError = (n: number) =>
    !Number.isFinite(n) || n < MIN_STAKE
      ? `Minimum stake is ${MIN_STAKE} points.`
      : n > MAX_STAKE
        ? `Maximum stake is ${MAX_STAKE.toLocaleString()} points.`
        : null;

  const mut = useMutation({
    mutationFn: async (market: MarketKey) => {
      const pick = picks[market];
      if (!pick) throw new Error("Select an option");
      const stakeVal = stakes[market] ?? String(MIN_STAKE);
      const n = Number(stakeVal);
      const err = stakeError(n);
      if (err) throw new Error(err);
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
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets", matchId, user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const csMut = useMutation({
    mutationFn: async (selection: string) => {
      const odds = csPicks[selection];
      if (!odds) throw new Error("Selection missing");
      const stakeVal = csStakes[selection] ?? String(MIN_STAKE);
      const n = Number(stakeVal);
      const err = stakeError(n);
      if (err) throw new Error(err);
      return place({
        data: {
          matchId,
          market: "correct_score",
          selection,
          stake: n,
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (_, selection) => {
      toast.success(`Bet placed on ${selectionLabel(selection)}`);
      setCsPicks((prev) => {
        const { [selection]: _omit, ...rest } = prev;
        return rest;
      });
      setCsStakes((prev) => {
        const { [selection]: _omit, ...rest } = prev;
        return rest;
      });
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets", matchId, user?.id] });
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
    const stake = stakes[market] ?? String(MIN_STAKE);
    const stakeNum = Number(stake);
    const sErr = stakeError(stakeNum);
    const potential = pick ? (stakeNum * pick.odds || 0).toFixed(2) : "0.00";
    const isPending = mut.isPending && mut.variables === market;

    return (
      <div className="space-y-2">
        <div className={`grid ${cols} gap-2`}>
          {rows.map((o) => {
            const isPicked = pick?.selection === o.selection;
            const alreadyPlaced = placedKeys.has(`${market}:${o.selection}`);
            return (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={isPicked ? "default" : "outline"}
                disabled={alreadyPlaced}
                title={alreadyPlaced ? "You already placed a bet on this selection" : undefined}
                className="flex flex-col h-auto py-2 relative disabled:opacity-60"
                onClick={() => setPicks((prev) => ({
                  ...prev,
                  [market]: isPicked ? null : { selection: o.selection, odds: Number(o.odds) }
                }))}
              >
                <span className="text-[10px] truncate max-w-full">{selectionLabel(o.selection)}</span>
                <span className="font-bold text-sm">{Number(o.odds).toFixed(2)}</span>
                {alreadyPlaced && (
                  <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
                )}
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
                type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake}
                onChange={(e) => setStakes((prev) => ({ ...prev, [market]: e.target.value }))}
                placeholder={`Stake (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                disabled={isPending || !!sErr}
                onClick={() => mut.mutate(market)}
                className="h-8 text-xs shrink-0"
              >
                {isPending ? "..." : `Bet → ${potential}`}
              </Button>
            </div>
            {sErr && <div className="text-[10px] text-destructive">{sErr}</div>}
          </div>
        )}
      </div>
    );
  };

  const renderCorrectScore = () => {
    const rows = orderedSelections("correct_score", grouped.correct_score);
    if (!rows.length) return <div className="text-xs text-muted-foreground">Not available.</div>;

    const selectedKeys = Object.keys(csPicks);
    const pendingSelection = csMut.isPending ? (csMut.variables as string | undefined) : undefined;

    return (
      <div className="space-y-3">
        <div className="text-[10px] text-muted-foreground">
          Tap multiple scores to back several — each gets its own stake.
        </div>
        <div className="grid grid-cols-4 gap-2">
          {rows.map((o) => {
            const isPicked = csPicks[o.selection] !== undefined;
            const alreadyPlaced = placedKeys.has(`correct_score:${o.selection}`);
            return (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={isPicked ? "default" : "outline"}
                disabled={alreadyPlaced}
                title={alreadyPlaced ? "You already placed a bet on this score" : undefined}
                className="flex flex-col h-auto py-2 relative disabled:opacity-60"
                onClick={() => {
                  if (isPicked) {
                    setCsPicks((prev) => {
                      const { [o.selection]: _omit, ...rest } = prev;
                      return rest;
                    });
                  } else {
                    setCsPicks((prev) => ({ ...prev, [o.selection]: Number(o.odds) }));
                    setCsStakes((prev) => ({ ...prev, [o.selection]: prev[o.selection] ?? String(MIN_STAKE) }));
                  }
                }}
              >
                <span className="text-[10px] truncate max-w-full">{selectionLabel(o.selection)}</span>
                <span className="font-bold text-sm">{Number(o.odds).toFixed(2)}</span>
                {alreadyPlaced && (
                  <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
                )}
              </Button>
            );
          })}
        </div>

        {selectedKeys.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your score slips ({selectedKeys.length})
            </div>
            {selectedKeys.map((sel) => {
              const odds = csPicks[sel];
              const stake = csStakes[sel] ?? String(MIN_STAKE);
              const stakeNum = Number(stake);
              const sErr = stakeError(stakeNum);
              const potential = (stakeNum * odds || 0).toFixed(2);
              const isPending = pendingSelection === sel;
              return (
                <div
                  key={sel}
                  className="space-y-2 p-3 rounded-md bg-muted/40 border animate-in fade-in-50 duration-200"
                >
                  <div className="text-xs flex justify-between items-center">
                    <div>
                      <span className="font-semibold">Score</span>
                      {" · "}{selectionLabel(sel)}
                      {" · "}@ <span className="font-mono font-bold">{odds.toFixed(2)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setCsPicks((prev) => {
                          const { [sel]: _omit, ...rest } = prev;
                          return rest;
                        });
                      }}
                    >
                      ×
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={MIN_STAKE}
                      max={MAX_STAKE}
                      value={stake}
                      onChange={(e) =>
                        setCsStakes((prev) => ({ ...prev, [sel]: e.target.value }))
                      }
                      placeholder={`Stake (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={isPending || !!sErr}
                      onClick={() => csMut.mutate(sel)}
                      className="h-8 text-xs shrink-0"
                    >
                      {isPending ? "..." : `Bet → ${potential}`}
                    </Button>
                  </div>
                  {sErr && <div className="text-[10px] text-destructive">{sErr}</div>}
                </div>
              );
            })}
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
          <TabsTrigger value="cs" className="text-xs">Score</TabsTrigger>
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

        <TabsContent value="cs" className="space-y-3 mt-2">
          {renderCorrectScore()}
        </TabsContent>

        <TabsContent value="sp" className="space-y-2 mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.half_time_full_time}</div>
          {renderMarketSection("half_time_full_time", "grid-cols-3")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
