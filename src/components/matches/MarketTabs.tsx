import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMatchMarkets, getMatchMarketsPublic, placeMarketBet } from "@/lib/markets.functions";
import { submitPrediction } from "@/lib/predictions.functions";
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

function resultOutcomeFromSelection(selection: string): "HOME" | "DRAW" | "AWAY" {
  const normalized = selection.toUpperCase();
  if (normalized === "HOME") return "HOME";
  if (normalized === "DRAW") return "DRAW";
  if (normalized === "AWAY") return "AWAY";
  throw new Error("Selection missing");
}

/* ---------- Primitives ---------- */

function QuestionHeading({
  question,
  note,
}: {
  question: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="mb-2 space-y-0.5">
      <h4 className="text-[15px] font-semibold leading-snug text-[var(--color-ink)]">
        {question}
      </h4>
      {note && (
        <p className="text-[11px] leading-snug text-[var(--color-ink-muted)]">{note}</p>
      )}
    </div>
  );
}


type OddsVariant = "yes" | "no" | "home" | "draw" | "away" | "neutral";

function classifySelection(selection: string): OddsVariant {
  const s = selection.toUpperCase();
  if (s === "YES" || s.startsWith("OVER_")) return "yes";
  if (s === "NO" || s.startsWith("UNDER_")) return "no";
  if (s === "HOME") return "home";
  if (s === "DRAW") return "draw";
  if (s === "AWAY") return "away";
  return "neutral";
}

function classifyCorrectScore(selection: string): OddsVariant {
  if (selection.toUpperCase() === "OTHER") return "neutral";
  const [home, away] = selection.split("-").map((n) => parseInt(n, 10));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "neutral";
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function displayLabel(selection: string, fallback: string): string {
  const s = selection.toUpperCase();
  if (s === "YES" || s.startsWith("OVER_")) return "Yes";
  if (s === "NO" || s.startsWith("UNDER_")) return "No";
  return fallback;
}

const NEUTRAL_BASE =
  "bg-black border border-[var(--color-neon)]/15";

const VARIANT_STYLES: Record<OddsVariant, { base: string; selected: string; priceColor: string; badgeBg: string; badgeText: string }> = {
  yes: {
    base: `${NEUTRAL_BASE} hover:border-[#60a5fa]/70`,
    selected: "border-2 border-[#60a5fa] bg-black shadow-[0_0_0_1px_#60a5fa]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[#60a5fa]",
    badgeText: "text-black",
  },
  no: {
    base: `${NEUTRAL_BASE} hover:border-[#fb7185]/70`,
    selected: "border-2 border-[#fb7185] bg-black shadow-[0_0_0_1px_#fb7185]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[#fb7185]",
    badgeText: "text-black",
  },
  home: {
    base: `${NEUTRAL_BASE} hover:border-[var(--color-neon)]/70`,
    selected: "border-2 border-[var(--color-neon)] bg-black shadow-[0_0_0_1px_var(--color-neon)]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[var(--color-neon)]",
    badgeText: "text-black",
  },
  draw: {
    base: `${NEUTRAL_BASE} hover:border-[#60a5fa]/70`,
    selected: "border-2 border-[#60a5fa] bg-black shadow-[0_0_0_1px_#60a5fa]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[#60a5fa]",
    badgeText: "text-black",
  },
  away: {
    base: `${NEUTRAL_BASE} hover:border-[#f472b6]/70`,
    selected: "border-2 border-[#f472b6] bg-black shadow-[0_0_0_1px_#f472b6]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[#f472b6]",
    badgeText: "text-black",
  },
  neutral: {
    base: `${NEUTRAL_BASE} hover:border-[var(--color-neon)]/70`,
    selected: "border-2 border-[var(--color-neon)] bg-black shadow-[0_0_0_1px_var(--color-neon)]",
    priceColor: "text-[var(--color-neon)]",
    badgeBg: "bg-[var(--color-neon)]",
    badgeText: "text-black",
  },
};

function OddsButton({
  selection,
  label,
  price,
  selected,
  alreadyPlaced,
  disabled,
  title,
  variant: variantOverride,
  onClick,
}: {
  selection: string;
  label: string;
  price: number;
  selected: boolean;
  alreadyPlaced: boolean;
  disabled: boolean;
  title?: string;
  variant?: OddsVariant;
  onClick: () => void;
}) {
  const variant = variantOverride ?? classifySelection(selection);
  const styles = VARIANT_STYLES[variant];
  const shown = displayLabel(selection, label);
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-ink)] ${
        selected ? styles.selected : styles.base
      }`}
    >
      <span className="w-full whitespace-normal break-words text-center text-[12px] font-medium leading-tight">
        {shown}
      </span>
      <span className={`font-display text-base font-bold tabular-nums ${styles.priceColor}`}>
        {price.toFixed(2)}x
      </span>
      {selected && !alreadyPlaced && (
        <span className={`absolute right-1.5 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${styles.badgeBg} ${styles.badgeText}`}>✓</span>
      )}
      {alreadyPlaced && (
        <span className={`absolute right-1.5 top-1 text-[10px] font-bold ${styles.priceColor}`}>✓</span>
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
  const prob = impliedProbability(odds);
  const noBalance = balance <= 0;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const canSubmit = !isPending && !error && !noBalance && !overBalance && stakeNum >= MIN_STAKE;
  const buttonLabel = noBalance
    ? "Add Points to Lock"
    : overBalance
      ? "Stake exceeds points balance"
      : "Lock Prediction";

  const wrapperClass = sticky
    ? "fixed inset-x-0 z-50 mx-auto max-w-2xl border border-[var(--color-neon)]/40 bg-[#050A08]/98 backdrop-blur p-3.5 space-y-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] rounded-t-lg"
    : "mt-2 rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A] p-3.5 space-y-2.5 animate-in fade-in-50 duration-200";

  return (
    <div
      className={wrapperClass}
      style={
        sticky
          ? {
              bottom: "calc(72px + env(safe-area-inset-bottom))",
              paddingBottom: "0.875rem",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
            Your prediction
          </div>
          {matchName && (
            <div className="truncate text-[11px] text-[var(--color-ink-muted)]">{matchName}</div>
          )}
          <div className="text-[13px] leading-snug text-[var(--color-ink)]">
            {question ?? marketLabel}
          </div>
          <div className="text-[13px] leading-snug text-[var(--color-ink)]">
            <span className="font-semibold">{selectionText}</span>
            <span className="mx-1.5 text-[var(--color-ink-muted)]">·</span>
            <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
              {odds.toFixed(2)}x
            </span>
            {prob > 0 && (
              <span className="ml-1.5 text-[11px] text-[var(--color-ink-muted)]">
                market estimate ~{prob}%
              </span>
            )}
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
          placeholder={`Points (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
          className="flex-1 min-w-0 rounded-md border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[var(--color-surface-border)] disabled:text-[var(--color-ink-muted)]"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><span>{buttonLabel}</span>{canSubmit && <ArrowUpRight className="h-3.5 w-3.5" />}</>
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
          <span className="font-bold tabular-nums text-[var(--color-ink)]">
            {balance.toFixed(2)}
          </span>
        </span>
        {noBalance && (
          <span className="font-semibold text-destructive">
            You need points to lock this prediction.
          </span>
        )}
        {!noBalance && overBalance && (
          <span className="font-semibold text-destructive">Stake exceeds points balance</span>
        )}
      </div>

      {error && !overBalance && !noBalance && (
        <div className="text-[11px] text-destructive">{error}</div>
      )}
    </div>
  );
}


function SuspendedBadge() {
  return (
    <div className="inline-block rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
      Market paused
    </div>
  );
}

function SettlementNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-2 border-[var(--color-neon)]/60 bg-[var(--color-neon)]/5 px-3 py-2 text-[12px] leading-snug text-[var(--color-ink)]/85">
      {children}
    </div>
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

export function MarketTabs({ matchId, locked, bettingBlocked = false, suspendedMarkets = [], homeTeam, awayTeam, publicMode = false }: { matchId: string; locked: boolean; bettingBlocked?: boolean; suspendedMarkets?: string[]; homeTeam?: string; awayTeam?: string; publicMode?: boolean }) {
  const isMarketSuspended = (m: string) =>
    bettingBlocked || suspendedMarkets.includes("ALL") || suspendedMarkets.includes(m);
  const fn = useServerFn(publicMode ? getMatchMarketsPublic : getMatchMarkets);
  const place = useServerFn(placeMarketBet);
  const submitResult = useServerFn(submitPrediction);
  const walletFn = useServerFn(getMyWallet);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("pop");
  const [showAllScores, setShowAllScores] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [publicMode ? "match-markets-public" : "match-markets", matchId],
    queryFn: () => fn({ data: { matchId } }),
    enabled: !locked,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id && !locked && !publicMode,
    staleTime: 15000,
  });
  // Visitors get a generous demo balance so the slip UI is fully explorable.
  const balance = publicMode ? 1000 : Number(wallet.data?.balance ?? 0);

  const myBets = useQuery({
    queryKey: ["my-match-pending-bets", matchId, user?.id],
    enabled: !!user && !locked && !publicMode,
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
      if (publicMode) { setSignInOpen(true); return null as any; }
      const pick = picks[market];
      if (!pick) throw new Error("Select an option");
      const stakeVal = stakes[market] ?? String(MIN_STAKE);
      const n = Number(stakeVal);
      const err = stakeError(n);
      if (err) throw new Error(err);
      if (n > balance) throw new Error("Insufficient points");
      const slipId = getSlipId(`single:${market}`, `${pick.selection}:${pick.odds}:${n}`);
      if (market === "1x2") {
        return submitResult({
          data: {
            matchId,
            market: "result",
            outcome: resultOutcomeFromSelection(pick.selection),
            referenceOdds: pick.odds,
            virtualStake: n,
            clientRequestId: slipId,
          },
        });
      }
      return place({
        data: { matchId, market, selection: pick.selection, stake: n, clientRequestId: slipId },
      });
    },
    onSuccess: (result, market) => {
      if (publicMode || result == null) return;
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
      if (publicMode) { setSignInOpen(true); return null as any; }
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
    onSuccess: (result, selection) => {
      if (publicMode || result == null) return;
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
  const has1x2 = getGroup("1x2").length > 0;
  const hasPopular =
    has1x2 ||
    getGroup("over_under_2_5").length > 0 || getGroup("btts").length > 0 ||
    getGroup("double_chance").length > 0 || hasToQualify;

  const tabEnabled: Record<TabId, boolean> = {
    pop: hasPopular, goals: true, cs: true, ex: hasExtras, cards: hasCards, corners: hasCorners, sp: hasSpecials,
  };

  const orderedSelections = (market: MarketKey, rows: OddsRow[]) => {
    let order: string[] = [];
    if (market === "1x2") order = ["home", "draw", "away"];
    else if (market === "correct_score") order = CORRECT_SCORES;
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
                selection={o.selection}
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
                selection={o.selection}
                label={selectionLabel(o.selection)}
                price={Number(o.odds)}
                selected={isPicked}
                alreadyPlaced={alreadyPlaced}
                disabled={alreadyPlaced || csSuspended}
                variant="correctScore"
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
            {has1x2 && <Section market="1x2" cols="grid-cols-3" />}
            {getGroup("over_under_2_5").length > 0 && <Section market="over_under_2_5" cols="grid-cols-2" />}
            {getGroup("btts").length > 0 && <Section market="btts" cols="grid-cols-2" />}
            {getGroup("double_chance").length > 0 && <Section market="double_chance" cols="grid-cols-3" />}
            {hasToQualify && <Section market="to_qualify" cols="grid-cols-2" />}
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
              <Section market="draw_no_bet" cols="grid-cols-2" />
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
              <Section market="to_qualify" cols="grid-cols-2" />
            )}
            {hasHtFt && <Section market="half_time_full_time" cols="grid-cols-3" />}
          </div>
        )}
      </div>
      {signInOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSignInOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-neon)]/30 bg-[var(--color-surface-2)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-neon)]">
                  Sign in required
                </div>
                <h3 className="mt-1 text-[16px] font-bold tracking-tight text-[var(--color-ink)]">
                  Sign in to lock this prediction
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                  You're exploring in visitor mode. Create a free account or sign in to place your bet with prediction points.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSignInOpen(false)}
                className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                to="/auth"
                className="rounded-full border border-[var(--color-surface-border)] px-3 py-2 text-center text-[12px] font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)]/60 hover:text-[var(--color-neon)]"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-[var(--color-neon)] px-3 py-2 text-center text-[12px] font-bold text-[#04140A] transition-all hover:shadow-[0_0_18px_var(--color-neon-glow)]"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
