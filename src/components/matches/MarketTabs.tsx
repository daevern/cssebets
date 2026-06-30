import { useMemo, useRef, useState } from "react";
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
  OVER_UNDER_LINES,
  CARDS_LINES,
  CORNERS_LINES,
  type MarketKey,
} from "@/lib/markets-catalog";

type OddsRow = { id: string; market: string; selection: string; odds: number };

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

export function MarketTabs({ matchId, locked, bettingBlocked = false, suspendedMarkets = [] }: { matchId: string; locked: boolean; bettingBlocked?: boolean; suspendedMarkets?: string[] }) {
  const isMarketSuspended = (m: string) =>
    bettingBlocked || suspendedMarkets.includes("ALL") || suspendedMarkets.includes(m);
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
    const g: Partial<Record<MarketKey, OddsRow[]>> = {};
    for (const o of (data?.odds ?? []) as OddsRow[]) {
      const key = o.market as MarketKey;
      (g[key] ??= []).push(o);
    }
    return g;
  }, [data]);
  const getGroup = (k: MarketKey): OddsRow[] => grouped[k] ?? [];

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

  // Stable idempotency keys per bet slip. Same key is reused for retries
  // of the same (market, selection, stake) so double-clicks or transport
  // retries collapse into one prediction server-side.
  const slipIdsRef = useRef<Map<string, { sig: string; id: string }>>(new Map());
  const getSlipId = (key: string, sig: string) => {
    const cur = slipIdsRef.current.get(key);
    if (cur && cur.sig === sig) return cur.id;
    const id = crypto.randomUUID();
    slipIdsRef.current.set(key, { sig, id });
    return id;
  };
  const clearSlipId = (key: string) => { slipIdsRef.current.delete(key); };

  const mut = useMutation({
    mutationFn: async (market: MarketKey) => {
      const pick = picks[market];
      if (!pick) throw new Error("Select an option");
      const stakeVal = stakes[market] ?? String(MIN_STAKE);
      const n = Number(stakeVal);
      const err = stakeError(n);
      if (err) throw new Error(err);
      const slipId = getSlipId(`single:${market}`, `${pick.selection}:${pick.odds}:${n}`);
      return place({
        data: {
          matchId,
          market,
          selection: pick.selection,
          stake: n,
          clientRequestId: slipId,
        },
      });
    },
    onSuccess: (_, market) => {
      toast.success("Bet placed");
      clearSlipId(`single:${market}`);
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
      const slipId = getSlipId(`cs:${selection}`, `${odds}:${n}`);
      return place({
        data: {
          matchId,
          market: "correct_score",
          selection,
          stake: n,
          clientRequestId: slipId,
        },
      });
    },
    onSuccess: (_, selection) => {
      toast.success(`Bet placed on ${selectionLabel(selection)}`);
      clearSlipId(`cs:${selection}`);
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

  const hasHtFt = getGroup("half_time_full_time").length > 0;
  const hasToQualify = getGroup("to_qualify").length > 0;
  const hasExtras =
    getGroup("double_chance").length > 0 ||
    getGroup("draw_no_bet").length > 0 ||
    getGroup("goals_odd_even").length > 0 ||
    getGroup("clean_sheet_home").length > 0 ||
    getGroup("clean_sheet_away").length > 0 ||
    getGroup("win_to_nil_home").length > 0 ||
    getGroup("win_to_nil_away").length > 0;
  const hasSpecials = hasHtFt || hasToQualify;

  const orderedSelections = (market: MarketKey, rows: OddsRow[]) => {
    let order: string[] = [];
    if (market === "correct_score") order = CORRECT_SCORES;
    else if (market === "half_time_full_time") order = HTFT_OPTIONS;
    else if (market === "exact_total_goals") order = EXACT_GOALS_OPTIONS;
    else if (market === "btts") order = ["YES", "NO"];
    else if (market === "to_qualify") order = ["HOME", "AWAY"];
    else if (market === "double_chance") order = ["HOME_OR_DRAW", "HOME_OR_AWAY", "DRAW_OR_AWAY"];
    else if (market === "draw_no_bet") order = ["HOME", "AWAY"];
    else if (market === "goals_odd_even") order = ["ODD", "EVEN"];
    else if (
      market === "clean_sheet_home" || market === "clean_sheet_away" ||
      market === "win_to_nil_home" || market === "win_to_nil_away"
    ) order = ["YES", "NO"];
    else if (market.startsWith("over_under_")) {
      const line = market.replace("over_under_", "");
      order = [`OVER_${line}`, `UNDER_${line}`];
    }
    const byKey = new Map(rows.map(r => [r.selection, r]));
    return order.map(s => byKey.get(s)).filter(Boolean) as OddsRow[];
  };

  const renderMarketSection = (market: MarketKey, cols: string) => {
    const rows = orderedSelections(market, getGroup(market));
    if (!rows.length) return <div className="text-xs text-muted-foreground">Not available.</div>;
    const suspended = isMarketSuspended(market);
    const pick = picks[market];
    const stake = stakes[market] ?? String(MIN_STAKE);
    const stakeNum = Number(stake);
    const sErr = stakeError(stakeNum);
    const potential = pick ? (stakeNum * pick.odds || 0).toFixed(2) : "0.00";
    const isPending = mut.isPending && mut.variables === market;

    return (
      <div className="space-y-2">
        {suspended && (
          <div className="text-[10px] font-medium rounded border border-destructive/40 bg-destructive/10 text-destructive px-2 py-1 inline-block">
            Suspended
          </div>
        )}
        <div className={`grid ${cols} gap-2`}>
          {rows.map((o) => {
            const isPicked = pick?.selection === o.selection;
            const alreadyPlaced = placedKeys.has(`${market}:${o.selection}`);
            const disabled = alreadyPlaced || suspended;
            return (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={isPicked ? "default" : "outline"}
                disabled={disabled}
                title={
                  suspended ? "Market suspended" :
                  alreadyPlaced ? "You already placed a bet on this selection" : undefined
                }
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

        {pick && !suspended && (
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
    const rows = orderedSelections("correct_score", getGroup("correct_score"));
    if (!rows.length) return <div className="text-xs text-muted-foreground">Not available.</div>;

    const selectedKeys = Object.keys(csPicks);
    const pendingSelection = csMut.isPending ? (csMut.variables as string | undefined) : undefined;

    const csSuspended = isMarketSuspended("correct_score");
    return (
      <div className="space-y-3">
        {csSuspended && (
          <div className="text-[10px] font-medium rounded border border-destructive/40 bg-destructive/10 text-destructive px-2 py-1 inline-block">
            Suspended
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Tap multiple scores to back several — each gets its own stake.
        </div>
        <div className="grid grid-cols-4 gap-2">
          {rows.map((o) => {
            const isPicked = csPicks[o.selection] !== undefined;
            const alreadyPlaced = placedKeys.has(`correct_score:${o.selection}`);
            const disabled = alreadyPlaced || csSuspended;
            return (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={isPicked ? "default" : "outline"}
                disabled={disabled}
                title={csSuspended ? "Market suspended" : alreadyPlaced ? "You already placed a bet on this score" : undefined}
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

        {!csSuspended && selectedKeys.length > 0 && (
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
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="goals" className="text-xs">Goals</TabsTrigger>
          <TabsTrigger value="cs" className="text-xs">Score</TabsTrigger>
          <TabsTrigger value="ex" className="text-xs" disabled={!hasExtras}>Extras</TabsTrigger>
          <TabsTrigger value="sp" className="text-xs" disabled={!hasSpecials}>Specials</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-4 mt-2">
          {OVER_UNDER_LINES.map((mk) => {
            if (getGroup(mk).length === 0) return null;
            return (
              <div key={mk}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {MARKET_LABELS[mk]}
                </div>
                {renderMarketSection(mk, "grid-cols-2")}
              </div>
            );
          })}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.btts}</div>
            {renderMarketSection("btts", "grid-cols-2")}
          </div>
          {getGroup("goals_odd_even").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.goals_odd_even}</div>
              {renderMarketSection("goals_odd_even", "grid-cols-2")}
            </div>
          )}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.exact_total_goals}</div>
            {renderMarketSection("exact_total_goals", "grid-cols-3")}
          </div>
        </TabsContent>

        <TabsContent value="cs" className="space-y-3 mt-2">
          {renderCorrectScore()}
        </TabsContent>

        <TabsContent value="ex" className="space-y-4 mt-2">
          {getGroup("double_chance").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.double_chance}</div>
              {renderMarketSection("double_chance", "grid-cols-3")}
            </div>
          )}
          {getGroup("draw_no_bet").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {MARKET_LABELS.draw_no_bet}
                <span className="ml-2 font-normal normal-case text-muted-foreground/80">· stake refunded on a draw</span>
              </div>
              {renderMarketSection("draw_no_bet", "grid-cols-2")}
            </div>
          )}
          {getGroup("clean_sheet_home").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.clean_sheet_home}</div>
              {renderMarketSection("clean_sheet_home", "grid-cols-2")}
            </div>
          )}
          {getGroup("clean_sheet_away").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.clean_sheet_away}</div>
              {renderMarketSection("clean_sheet_away", "grid-cols-2")}
            </div>
          )}
          {getGroup("win_to_nil_home").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.win_to_nil_home}</div>
              {renderMarketSection("win_to_nil_home", "grid-cols-2")}
            </div>
          )}
          {getGroup("win_to_nil_away").length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.win_to_nil_away}</div>
              {renderMarketSection("win_to_nil_away", "grid-cols-2")}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sp" className="space-y-4 mt-2">
          {hasToQualify && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {MARKET_LABELS.to_qualify}
                <span className="ml-2 font-normal normal-case text-muted-foreground/80">· paid on who advances (incl. ET &amp; penalties)</span>
              </div>
              {renderMarketSection("to_qualify", "grid-cols-2")}
            </div>
          )}
          {hasHtFt && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{MARKET_LABELS.half_time_full_time}</div>
              {renderMarketSection("half_time_full_time", "grid-cols-3")}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
