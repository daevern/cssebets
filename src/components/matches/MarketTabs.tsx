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

function QuestionHeading({
  question,
  note,
}: {
  question: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h4 className="text-[16px] font-medium leading-snug text-[var(--ink)]">
        {question}
      </h4>
      {note && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">{note}</span>
      )}
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
  showProbability = true,
}: {
  label: string;
  price: number;
  selected: boolean;
  alreadyPlaced: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  showProbability?: boolean;
}) {
  const prob = impliedProbability(price);
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex min-h-[64px] flex-col items-start justify-center gap-1 rounded-sm px-3.5 py-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        selected
          ? "bg-[var(--neon)]/10 ring-1 ring-inset ring-[var(--neon)]/60"
          : "bg-[var(--surface-2)]/60 hover:bg-[var(--surface-3)]/60"
      }`}
    >
      <span className={`w-full truncate text-[11px] font-medium uppercase tracking-[0.14em] ${selected ? "text-[var(--neon)]" : "text-[var(--ink-muted)]"}`}>
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display text-xl font-medium tabular-nums tracking-tight ${selected ? "text-[var(--neon)]" : "text-[var(--ink)]"}`}>
          {price.toFixed(2)}
        </span>
        {showProbability && prob > 0 && (
          <span className="text-[10px] font-medium tabular-nums text-[var(--ink-faint)]">
            {prob}%
          </span>
        )}
      </div>
      {alreadyPlaced && (
        <span className="absolute right-2 top-2 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--neon)]">
          Locked
        </span>
      )}
    </button>
  );
}

function StakeSlip({
  marketLabel,
  question,
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
  question?: string;
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
  const potentialReturn = stakeNum * odds;
  const potentialGain = potentialReturn - stakeNum;
  const noBalance = balance <= 0;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const canSubmit = !isPending && !error && !noBalance && !overBalance && stakeNum >= MIN_STAKE;
  const buttonLabel = noBalance
    ? "Add points to lock"
    : overBalance
      ? "Exceeds balance"
      : "Lock prediction";

  const wrapperClass = sticky
    ? "sticky z-50 rounded-sm border border-[var(--neon)]/40 bg-[#050A08]/95 p-4 space-y-4 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] backdrop-blur"
    : "mt-4 rounded-sm bg-[var(--surface-2)]/60 p-5 space-y-4 animate-in fade-in-50 duration-200";

  return (
    <div
      className={wrapperClass}
      style={
        sticky
          ? { bottom: "calc(88px + env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        <span>Your prediction</span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          Clear
        </button>
      </div>

      {matchName && (
        <div className="text-[11px] text-[var(--ink-muted)]">{matchName}</div>
      )}
      <p className="text-[14px] leading-snug text-[var(--ink-2)]">{question ?? marketLabel}</p>
      <p className="text-[15px] leading-snug text-[var(--ink)]">
        <span className="font-medium">{selectionText}</span>{" "}
        <span className="text-[var(--ink-muted)]">at</span>{" "}
        <span className="font-display font-medium tabular-nums text-[var(--neon)]">
          {odds.toFixed(2)}x
        </span>
      </p>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Points
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_STAKE}
            max={MAX_STAKE}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            disabled={noBalance}
            className="w-full border-0 border-b border-[var(--surface-border)] bg-transparent px-0 pb-2 font-display text-2xl font-medium tabular-nums text-[var(--ink)] outline-none transition-colors focus:border-[var(--neon)] disabled:opacity-40"
          />
        </label>
        <div className="self-end">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="inline-flex h-11 items-center gap-2 rounded-sm bg-[var(--neon)] px-5 text-[13px] font-medium text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[var(--surface-border)] disabled:text-[var(--ink-muted)]"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>{buttonLabel}{canSubmit && <ArrowUpRight className="h-3.5 w-3.5" />}</>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between text-[12px]">
        <div className="flex items-baseline gap-6 text-[var(--ink-2)]">
          <span>Return <span className="ml-1 font-display font-medium tabular-nums text-[var(--ink)]">{potentialReturn.toFixed(2)}</span></span>
          <span>Gain <span className="ml-1 font-display font-medium tabular-nums text-[var(--neon)]">+{potentialGain.toFixed(2)}</span></span>
        </div>
        <span className="text-[var(--ink-faint)]">Bal {balance.toFixed(0)}</span>
      </div>

      {noBalance && (
        <p className="text-[11px] text-[var(--ink-muted)]">You need points to lock this prediction.</p>
      )}
      {!noBalance && overBalance && (
        <p className="text-[11px] text-destructive">Stake exceeds your balance.</p>
      )}
      {error && !overBalance && !noBalance && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}

function SuspendedBadge() {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-destructive">
      Market paused
    </p>
  );
}

function SettlementNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-[var(--neon)]/50 pl-3 text-[12px] leading-snug text-[var(--ink-2)]">
      {children}
    </p>
  );
}


/* ---------- Main ---------- */

const TAB_DEFS = [
  { id: "pop", label: "Popular" },
  { id: "goals", label: "Goals" },
  { id: "ex", label: "Extras" },
  { id: "cards", label: "Cards" },
  { id: "corners", label: "Corners" },
  { id: "sp", label: "Specials" },
  { id: "cs", label: "Advanced · Score" },
] as const;
type TabId = (typeof TAB_DEFS)[number]["id"];

export function MarketTabs({ matchId, locked, bettingBlocked = false, suspendedMarkets = [], homeTeam, awayTeam }: { matchId: string; locked: boolean; bettingBlocked?: boolean; suspendedMarkets?: string[]; homeTeam?: string; awayTeam?: string }) {
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
            question={marketQuestion(market, homeTeam, awayTeam)}
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
        <QuestionHeading
          question="Advanced: What will the final score be?"
          note="Tap multiple scores — each locks its own points stake."
        />

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
            <div className="text-[11px] font-semibold text-[var(--color-neon)]">
              Your score predictions · {selectedKeys.length}
            </div>
            {selectedKeys.map((sel) => {
              const odds = csPicks[sel];
              const stake = csStakes[sel] ?? String(MIN_STAKE);
              const sErr = stakeError(Number(stake));
              const isPending = pendingSelection === sel;
              return (
                <StakeSlip
                  key={sel}
                  marketLabel="Correct Score"
                  question={`Will the final score be ${selectionLabel(sel)}?`}
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
      <QuestionHeading question={label ?? marketQuestion(market, homeTeam, awayTeam)} note={note} />
      {renderMarketSection(market, cols)}
    </div>
  );

  return (
    <div className="pt-4 space-y-4 -mx-3 sm:-mx-2 md:mx-0">
      {/* Consistent scrollable tab bar */}
      <div className="flex overflow-x-auto rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] scrollbar-none">

        {TAB_DEFS.map((t) => {
          const enabled = tabEnabled[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!enabled}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2.5 text-center text-[13px] font-semibold whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)]/60 last:border-r-0 ${
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
