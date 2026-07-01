import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMatchMarkets, placeMarketBet } from "@/lib/markets.functions";
import { getMyWallet } from "@/lib/wallet.functions";
import { Loader2, ArrowUpRight, X } from "lucide-react";
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
  isMarketActive,
  marketQuestion,
  impliedProbability,
  type MarketKey,
} from "@/lib/markets-catalog";

type OddsRow = { id: string; market: string; selection: string; odds: number };

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

const POPULAR_SCORES = ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "OTHER"];

/* ---------- Primitives ---------- */

function SectionLabel({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 mb-2 flex-wrap">
      <span className="h-1.5 w-1.5 self-center bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon-glow)]" />
      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--color-ink)]">
        {children}
      </span>
      {note && (
        <span className="text-[11px] font-normal normal-case tracking-normal text-[var(--color-ink-muted)]">
          · {note}
        </span>
      )}
      <span className="flex-1 border-t border-dashed border-[var(--color-surface-border)]" />
    </div>
  );
}


function OddsButton({
  label,
  price,
  selected,
  alreadyPlaced,
  disabled,
  title,
  onClick,
}: {
  label: string;
  price: number;
  selected: boolean;
  alreadyPlaced: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1 border px-2 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        selected
          ? "border-[var(--color-neon)] bg-[var(--color-neon)]/15 text-[var(--color-neon)] shadow-[0_0_18px_var(--color-neon-glow)]"
          : "border-[var(--color-surface-border)] bg-[#070D0A] hover:border-[var(--color-neon)]/60"
      }`}
    >
      <span className="w-full whitespace-normal break-words text-center text-[11px] font-semibold leading-tight text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="font-display text-base font-bold tabular-nums text-[var(--color-ink)]">
        {price.toFixed(2)}
      </span>
      {selected && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--color-neon)]" />
      )}
      {alreadyPlaced && (
        <span className="absolute right-1 top-1 text-[10px] font-bold text-[var(--color-neon)]">✓</span>
      )}
    </button>
  );
}

function StakeSlip({
  marketLabel,
  selectionText,
  odds,
  stake,
  setStake,
  onSubmit,
  onClear,
  isPending,
  error,
  balance,
  sticky = false,
  matchName,
}: {
  marketLabel: string;
  selectionText: string;
  odds: number;
  stake: string;
  setStake: (s: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  isPending: boolean;
  error: string | null;
  balance: number;
  sticky?: boolean;
  matchName?: string;
}) {
  const stakeNum = Number(stake) || 0;
  const potentialPayout = stakeNum * odds;
  const potentialProfit = potentialPayout - stakeNum;
  const noBalance = balance <= 0;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const canSubmit = !isPending && !error && !noBalance && !overBalance && stakeNum >= MIN_STAKE;
  const buttonLabel = noBalance
    ? "Insufficient points"
    : overBalance
      ? "Stake exceeds balance"
      : "Place Bet";

  const wrapperClass = sticky
    ? "sticky z-30 border border-[var(--color-neon)]/50 bg-[#050A08]/98 backdrop-blur p-3 space-y-2 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]"
    : "mt-2 border border-[var(--color-surface-border)] bg-[#070D0A] p-3 space-y-2 animate-in fade-in-50 duration-200";

  return (
    <div
      className={wrapperClass}
      style={
        sticky
          ? {
              bottom: "calc(72px + env(safe-area-inset-bottom))",
              paddingBottom: "0.75rem",
            }
          : undefined
      }
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          {matchName && (
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              {matchName}
            </div>
          )}
          <div className="text-[12px] leading-snug text-[var(--color-ink)]">
            <span className="font-bold text-[var(--color-neon)]">{marketLabel}</span>
            <span className="mx-1 opacity-50">·</span>
            <span>{selectionText}</span>
            <span className="mx-1 opacity-50">@</span>
            <span className="font-display font-bold tabular-nums">{odds.toFixed(2)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={MIN_STAKE}
          max={MAX_STAKE}
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          disabled={noBalance}
          placeholder={`Stake (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
          className="flex-1 min-w-0 border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--color-neon)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:bg-[var(--color-surface-border)] disabled:text-[var(--color-ink-muted)]"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><span>{buttonLabel}</span>{canSubmit && <ArrowUpRight className="h-3.5 w-3.5" />}</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between border border-[var(--color-surface-border)]/60 bg-black/40 px-2 py-1.5">
          <span className="text-[var(--color-ink-muted)]">Payout</span>
          <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
            {potentialPayout.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between border border-[var(--color-surface-border)]/60 bg-black/40 px-2 py-1.5">
          <span className="text-[var(--color-ink-muted)]">Profit</span>
          <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
            +{potentialProfit.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
        <span>Balance: <span className="font-bold tabular-nums text-[var(--color-ink)]">{balance.toFixed(2)}</span></span>
        {(noBalance || overBalance) && (
          <span className="font-bold text-destructive normal-case tracking-normal">
            {noBalance ? "Insufficient points" : "Stake exceeds balance"}
          </span>
        )}
      </div>

      {error && !overBalance && !noBalance && (
        <div className="text-[11px] normal-case text-destructive">{error}</div>
      )}
    </div>
  );
}


function SuspendedBadge() {
  return (
    <div className="inline-block border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
      Suspended
    </div>
  );
}

function SettlementNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border-l-2 border-[var(--color-neon)]/70 bg-[var(--color-neon)]/5 px-3 py-2 text-[12px] leading-snug text-[var(--color-ink)]/85">
      {children}
    </div>
  );
}

/* ---------- Main ---------- */

const TAB_DEFS = [
  { id: "pop", label: "Popular" },
  { id: "goals", label: "Goals" },
  { id: "cs", label: "Score" },
  { id: "ex", label: "Extras" },
  { id: "cards", label: "Cards" },
  { id: "corners", label: "Corners" },
  { id: "sp", label: "Specials" },
] as const;
type TabId = (typeof TAB_DEFS)[number]["id"];

export function MarketTabs({ matchId, locked, bettingBlocked = false, suspendedMarkets = [] }: { matchId: string; locked: boolean; bettingBlocked?: boolean; suspendedMarkets?: string[] }) {
  const isMarketSuspended = (m: string) =>
    bettingBlocked || suspendedMarkets.includes("ALL") || suspendedMarkets.includes(m);
  const fn = useServerFn(getMatchMarkets);
  const place = useServerFn(placeMarketBet);
  const walletFn = useServerFn(getMyWallet);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("pop");
  const [showAllScores, setShowAllScores] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["match-markets", matchId],
    queryFn: () => fn({ data: { matchId } }),
    enabled: !locked,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id && !locked,
    staleTime: 15000,
  });
  const balance = Number(wallet.data?.balance ?? 0);

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
  const getGroup = (k: MarketKey): OddsRow[] => (isMarketActive(k) ? (grouped[k] ?? []) : []);

  const [stakes, setStakes] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, { selection: string; odds: number } | null>>({});
  const [csPicks, setCsPicks] = useState<Record<string, number>>({});
  const [csStakes, setCsStakes] = useState<Record<string, string>>({});

  const stakeError = (n: number) =>
    !Number.isFinite(n) || n < MIN_STAKE
      ? `Minimum stake is ${MIN_STAKE} points.`
      : n > MAX_STAKE
        ? `Maximum stake is ${MAX_STAKE.toLocaleString()} points.`
        : null;

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
      if (n > balance) throw new Error("Insufficient points");
      const slipId = getSlipId(`single:${market}`, `${pick.selection}:${pick.odds}:${n}`);
      return place({
        data: { matchId, market, selection: pick.selection, stake: n, clientRequestId: slipId },
      });
    },
    onSuccess: (_, market) => {
      toast.success("Bet placed");
      clearSlipId(`single:${market}`);
      setPicks((prev) => ({ ...prev, [market]: null }));
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
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
      if (n > balance) throw new Error("Insufficient points");
      const slipId = getSlipId(`cs:${selection}`, `${odds}:${n}`);
      return place({
        data: { matchId, market: "correct_score", selection, stake: n, clientRequestId: slipId },
      });
    },
    onSuccess: (_, selection) => {
      toast.success(`Bet placed on ${selectionLabel(selection)}`);
      clearSlipId(`cs:${selection}`);
      setCsPicks((prev) => { const { [selection]: _o, ...rest } = prev; return rest; });
      setCsStakes((prev) => { const { [selection]: _o, ...rest } = prev; return rest; });
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets", matchId, user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (locked) return null;
  if (isLoading) {
    return (
      <div className="border-t border-dashed border-[var(--color-surface-border)] pt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        <Loader2 className="h-3 w-3 animate-spin text-[var(--color-neon)]" />
        Loading markets…
      </div>
    );
  }

  const hasHtFt = getGroup("half_time_full_time").length > 0;
  const hasToQualify = getGroup("to_qualify").length > 0;
  const hasExtras =
    getGroup("double_chance").length > 0 || getGroup("draw_no_bet").length > 0 ||
    getGroup("goals_odd_even").length > 0 ||
    getGroup("clean_sheet_home").length > 0 || getGroup("clean_sheet_away").length > 0 ||
    getGroup("win_to_nil_home").length > 0 || getGroup("win_to_nil_away").length > 0;
  const hasSpecials = hasHtFt || hasToQualify;
  const hasCards =
    CARDS_LINES.some((k) => getGroup(k).length > 0) ||
    getGroup("home_cards_over_under_1_5").length > 0 ||
    getGroup("away_cards_over_under_1_5").length > 0 ||
    getGroup("red_card_match").length > 0 ||
    getGroup("first_card").length > 0;
  const hasCorners =
    CORNERS_LINES.some((k) => getGroup(k).length > 0) ||
    getGroup("home_corners_over_under_4_5").length > 0 ||
    getGroup("away_corners_over_under_4_5").length > 0 ||
    getGroup("first_corner").length > 0;
  const hasPopular =
    getGroup("over_under_2_5").length > 0 || getGroup("btts").length > 0 ||
    getGroup("double_chance").length > 0 || hasToQualify;

  const tabEnabled: Record<TabId, boolean> = {
    pop: hasPopular, goals: true, cs: true, ex: hasExtras, cards: hasCards, corners: hasCorners, sp: hasSpecials,
  };

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
    else if (market === "red_card_match") order = ["YES", "NO"];
    else if (market === "first_card" || market === "first_corner") order = ["HOME", "AWAY", "NONE"];
    else if (
      market === "clean_sheet_home" || market === "clean_sheet_away" ||
      market === "win_to_nil_home" || market === "win_to_nil_away"
    ) order = ["YES", "NO"];
    else if (market.startsWith("cards_over_under_") || market === "home_cards_over_under_1_5" || market === "away_cards_over_under_1_5") {
      const line = market.replace(/^.*over_under_/, "");
      order = [`OVER_${line}`, `UNDER_${line}`];
    }
    else if (market.startsWith("corners_over_under_") || market === "home_corners_over_under_4_5" || market === "away_corners_over_under_4_5") {
      const line = market.replace(/^.*over_under_/, "");
      order = [`OVER_${line}`, `UNDER_${line}`];
    }
    else if (market.startsWith("over_under_")) {
      const line = market.replace("over_under_", "");
      order = [`OVER_${line}`, `UNDER_${line}`];
    }
    const byKey = new Map(rows.map(r => [r.selection, r]));
    return order.map(s => byKey.get(s)).filter(Boolean) as OddsRow[];
  };

  const renderMarketSection = (market: MarketKey, cols: string) => {
    const rows = orderedSelections(market, getGroup(market));
    if (!rows.length) return <div className="text-[11px] text-[var(--color-ink-muted)]">Not available.</div>;
    const suspended = isMarketSuspended(market);
    const pick = picks[market];
    const stake = stakes[market] ?? String(MIN_STAKE);
    const sErr = stakeError(Number(stake));
    const isPending = mut.isPending && mut.variables === market;

    return (
      <div>
        {suspended && <div className="mb-2"><SuspendedBadge /></div>}
        <div className={`grid ${cols} gap-2`}>
          {rows.map((o) => {
            const isPicked = pick?.selection === o.selection;
            const alreadyPlaced = placedKeys.has(`${market}:${o.selection}`);
            return (
              <OddsButton
                key={o.id}
                label={selectionLabel(o.selection)}
                price={Number(o.odds)}
                selected={isPicked}
                alreadyPlaced={alreadyPlaced}
                disabled={alreadyPlaced || suspended}
                title={suspended ? "Market suspended" : alreadyPlaced ? "You already placed a bet on this selection" : undefined}
                onClick={() => setPicks((prev) => ({
                  ...prev,
                  [market]: isPicked ? null : { selection: o.selection, odds: Number(o.odds) }
                }))}
              />
            );
          })}
        </div>

        {pick && !suspended && (
          <StakeSlip
            marketLabel={MARKET_LABELS[market]}
            selectionText={selectionLabel(pick.selection)}
            odds={pick.odds}
            stake={stake}
            setStake={(v) => setStakes((prev) => ({ ...prev, [market]: v }))}
            onSubmit={() => mut.mutate(market)}
            onClear={() => setPicks((prev) => ({ ...prev, [market]: null }))}
            isPending={isPending}
            error={sErr}
            balance={balance}
            sticky
          />
        )}
      </div>
    );
  };

  const renderCorrectScore = () => {
    const allRows = orderedSelections("correct_score", getGroup("correct_score"));
    if (!allRows.length) return <div className="text-[11px] text-[var(--color-ink-muted)]">Not available.</div>;
    const rows = showAllScores ? allRows : allRows.filter((r) => POPULAR_SCORES.includes(r.selection));
    const selectedKeys = Object.keys(csPicks);
    const pendingSelection = csMut.isPending ? (csMut.variables as string | undefined) : undefined;
    const csSuspended = isMarketSuspended("correct_score");
    return (
      <div>
        {csSuspended && <div className="mb-2"><SuspendedBadge /></div>}
        <div className="mb-2 text-[11px] text-[var(--color-ink-muted)]">
          Tap multiple scores — each gets its own stake.
        </div>
        <div className="grid grid-cols-3 gap-2">
          {rows.map((o) => {
            const isPicked = csPicks[o.selection] !== undefined;
            const alreadyPlaced = placedKeys.has(`correct_score:${o.selection}`);
            return (
              <OddsButton
                key={o.id}
                label={selectionLabel(o.selection)}
                price={Number(o.odds)}
                selected={isPicked}
                alreadyPlaced={alreadyPlaced}
                disabled={alreadyPlaced || csSuspended}
                title={csSuspended ? "Market suspended" : alreadyPlaced ? "You already placed a bet on this score" : undefined}
                onClick={() => {
                  if (isPicked) {
                    setCsPicks((prev) => { const { [o.selection]: _o, ...rest } = prev; return rest; });
                  } else {
                    setCsPicks((prev) => ({ ...prev, [o.selection]: Number(o.odds) }));
                    setCsStakes((prev) => ({ ...prev, [o.selection]: prev[o.selection] ?? String(MIN_STAKE) }));
                  }
                }}
              />
            );
          })}
        </div>

        {allRows.length > rows.length && !showAllScores && (
          <button
            type="button"
            onClick={() => setShowAllScores(true)}
            className="mt-3 w-full border border-dashed border-[var(--color-surface-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] transition-colors"
          >
            Show all scores ({allRows.length - rows.length} more)
          </button>
        )}
        {showAllScores && (
          <button
            type="button"
            onClick={() => setShowAllScores(false)}
            className="mt-3 w-full border border-dashed border-[var(--color-surface-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] transition-colors"
          >
            Show less
          </button>
        )}

        {!csSuspended && selectedKeys.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-neon)]">
              Your score slips · {selectedKeys.length}
            </div>
            {selectedKeys.map((sel) => {
              const odds = csPicks[sel];
              const stake = csStakes[sel] ?? String(MIN_STAKE);
              const sErr = stakeError(Number(stake));
              const isPending = pendingSelection === sel;
              return (
                <StakeSlip
                  key={sel}
                  marketLabel="Score"
                  selectionText={selectionLabel(sel)}
                  odds={odds}
                  stake={stake}
                  setStake={(v) => setCsStakes((prev) => ({ ...prev, [sel]: v }))}
                  onSubmit={() => csMut.mutate(sel)}
                  onClear={() => setCsPicks((prev) => { const { [sel]: _o, ...rest } = prev; return rest; })}
                  isPending={isPending}
                  error={sErr}
                  balance={balance}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const Section = ({ market, label, cols, note }: { market: MarketKey; label?: string; cols: string; note?: React.ReactNode }) => (
    <div>
      <SectionLabel note={note}>{label ?? MARKET_LABELS[market]}</SectionLabel>
      {renderMarketSection(market, cols)}
    </div>
  );

  return (
    <div className="border-t border-dashed border-[var(--color-surface-border)] pt-4 space-y-4 -mx-3 sm:-mx-2 md:mx-0">
      {/* Consistent scrollable tab bar */}
      <div className="flex overflow-x-auto border-y sm:border border-[var(--color-surface-border)] bg-[#070D0A] scrollbar-none">
        {TAB_DEFS.map((t) => {
          const enabled = tabEnabled[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!enabled}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2.5 text-center text-[12px] font-bold uppercase tracking-[0.1em] whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)] last:border-r-0 ${
                active
                  ? "bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[inset_0_-2px_0_0_var(--color-neon)]"
                  : enabled
                    ? "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)]/30 cursor-not-allowed"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="px-3 sm:px-2 md:px-0">
        {tab === "pop" && (
          <div className="space-y-4">
            {getGroup("over_under_2_5").length > 0 && <Section market="over_under_2_5" cols="grid-cols-2" />}
            {getGroup("btts").length > 0 && <Section market="btts" cols="grid-cols-2" />}
            {getGroup("double_chance").length > 0 && <Section market="double_chance" cols="grid-cols-3" />}
            {hasToQualify && <Section market="to_qualify" cols="grid-cols-2" note="paid on who advances (incl. ET & penalties)" />}
            {!hasPopular && <div className="text-[12px] text-[var(--color-ink-muted)]">No popular markets available.</div>}
          </div>
        )}

        {tab === "goals" && (
          <div className="space-y-4">
            {OVER_UNDER_LINES.map((mk) =>
              getGroup(mk).length > 0 ? <Section key={mk} market={mk} cols="grid-cols-2" /> : null
            )}
            <Section market="btts" cols="grid-cols-2" />
            {getGroup("goals_odd_even").length > 0 && <Section market="goals_odd_even" cols="grid-cols-2" />}
            {getGroup("exact_total_goals").length > 0 && <Section market="exact_total_goals" cols="grid-cols-3" />}
          </div>
        )}

        {tab === "cs" && <div>{renderCorrectScore()}</div>}

        {tab === "ex" && (
          <div className="space-y-4">
            {getGroup("double_chance").length > 0 && <Section market="double_chance" cols="grid-cols-3" />}
            {getGroup("draw_no_bet").length > 0 && (
              <Section market="draw_no_bet" cols="grid-cols-2" note="stake refunded on a draw" />
            )}
            {getGroup("clean_sheet_home").length > 0 && <Section market="clean_sheet_home" cols="grid-cols-2" />}
            {getGroup("clean_sheet_away").length > 0 && <Section market="clean_sheet_away" cols="grid-cols-2" />}
            {getGroup("win_to_nil_home").length > 0 && <Section market="win_to_nil_home" cols="grid-cols-2" />}
            {getGroup("win_to_nil_away").length > 0 && <Section market="win_to_nil_away" cols="grid-cols-2" />}
          </div>
        )}

        {tab === "cards" && (
          <div className="space-y-4">
            <SettlementNote>
              Settled on official full-time card counts. Stake refunded if official data is unavailable.
            </SettlementNote>
            {CARDS_LINES.map((mk) =>
              getGroup(mk).length > 0 ? <Section key={mk} market={mk} cols="grid-cols-2" /> : null
            )}
            {getGroup("home_cards_over_under_1_5").length > 0 && <Section market="home_cards_over_under_1_5" cols="grid-cols-2" />}
            {getGroup("away_cards_over_under_1_5").length > 0 && <Section market="away_cards_over_under_1_5" cols="grid-cols-2" />}
            {getGroup("red_card_match").length > 0 && <Section market="red_card_match" cols="grid-cols-2" />}
            {getGroup("first_card").length > 0 && <Section market="first_card" cols="grid-cols-3" />}
          </div>
        )}

        {tab === "corners" && (
          <div className="space-y-4">
            <SettlementNote>
              Settled on official full-time corner counts. Stake refunded if official data is unavailable.
            </SettlementNote>
            {CORNERS_LINES.map((mk) =>
              getGroup(mk).length > 0 ? <Section key={mk} market={mk} cols="grid-cols-2" /> : null
            )}
            {getGroup("home_corners_over_under_4_5").length > 0 && <Section market="home_corners_over_under_4_5" cols="grid-cols-2" />}
            {getGroup("away_corners_over_under_4_5").length > 0 && <Section market="away_corners_over_under_4_5" cols="grid-cols-2" />}
            {getGroup("first_corner").length > 0 && <Section market="first_corner" cols="grid-cols-3" />}
          </div>
        )}

        {tab === "sp" && (
          <div className="space-y-4">
            {hasToQualify && (
              <Section market="to_qualify" cols="grid-cols-2" note="paid on who advances (incl. ET & penalties)" />
            )}
            {hasHtFt && <Section market="half_time_full_time" cols="grid-cols-3" />}
          </div>
        )}
      </div>
    </div>
  );
}
