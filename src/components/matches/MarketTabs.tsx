import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMatchMarkets, placeMarketBet } from "@/lib/markets.functions";
import { Loader2, ArrowUpRight } from "lucide-react";
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
  type MarketKey,
} from "@/lib/markets-catalog";

type OddsRow = { id: string; market: string; selection: string; odds: number };

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

/* ---------- Custom CSSEBets stencil primitives ---------- */

function SectionLabel({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="h-1.5 w-1.5 bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon-glow)]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {children}
      </span>
      {note && (
        <span className="text-[9px] font-medium normal-case tracking-normal text-[var(--color-ink-muted)]/70">
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
  inline = false,
}: {
  label: string;
  price: number;
  selected: boolean;
  alreadyPlaced: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  inline?: boolean;
}) {
  const stateClasses = selected
    ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[0_0_18px_var(--color-neon-glow)]"
    : "border-[var(--color-surface-border)] bg-[#070D0A] hover:border-[var(--color-neon)]/60";
  if (inline) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={onClick}
        className={`relative flex items-center justify-between gap-2 border px-3 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${stateClasses}`}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          {label}
        </span>
        <span className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
          {price.toFixed(2)}
        </span>
        {alreadyPlaced && (
          <span className="absolute right-1 top-1 text-[9px] font-bold text-[var(--color-neon)]">✓</span>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 border px-2 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${stateClasses}`}
    >
      <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="font-display text-base font-bold tabular-nums">{price.toFixed(2)}</span>
      {alreadyPlaced && (
        <span className="absolute right-1 top-1 text-[9px] font-bold text-[var(--color-neon)]">✓</span>
      )}
    </button>
  );
}

function EmptySide() {
  return (
    <div className="flex items-center justify-center border border-dashed border-[var(--color-surface-border)] bg-[#070D0A]/50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]/40">
      —
    </div>
  );
}

function LinePill({ line }: { line: string }) {
  return (
    <div className="flex items-center justify-center border border-[var(--color-surface-border)] bg-black/40 px-2 py-2.5 font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
      {line}
    </div>
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
}) {
  const potential = (Number(stake) * odds || 0).toFixed(2);
  return (
    <div className="mt-2 border border-[var(--color-surface-border)] bg-[#070D0A] p-3 space-y-2 animate-in fade-in-50 duration-200">
      <div className="flex justify-between items-start gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)] leading-relaxed">
          <span className="text-[var(--color-neon)] font-bold">{marketLabel}</span>
          <span className="mx-1 opacity-50">/</span>
          <span className="text-[var(--color-ink)]">{selectionText}</span>
          <span className="mx-1 opacity-50">@</span>
          <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">{odds.toFixed(2)}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-sm leading-none px-1"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={MIN_STAKE}
          max={MAX_STAKE}
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          placeholder={`Stake (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
          className="flex-1 border border-[var(--color-surface-border)] bg-black px-3 py-2 font-display text-sm font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)]"
        />
        <button
          type="button"
          disabled={isPending || !!error}
          onClick={onSubmit}
          className="flex items-center justify-center gap-1.5 rounded-full bg-[var(--color-neon)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (
            <><span>Bet → {potential}</span><ArrowUpRight className="h-3 w-3" /></>
          )}
        </button>
      </div>
      {error && <div className="text-[10px] uppercase tracking-wider text-destructive">{error}</div>}
    </div>
  );
}

function SuspendedBadge() {
  return (
    <div className="inline-block border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-destructive">
      Suspended
    </div>
  );
}

/* ---------- Main component ---------- */

const TAB_DEFS = [
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
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("goals");

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
        data: { matchId, market: "correct_score", selection, stake: n, clientRequestId: slipId },
      });
    },
    onSuccess: (_, selection) => {
      toast.success(`Bet placed on ${selectionLabel(selection)}`);
      clearSlipId(`cs:${selection}`);
      setCsPicks((prev) => { const { [selection]: _o, ...rest } = prev; return rest; });
      setCsStakes((prev) => { const { [selection]: _o, ...rest } = prev; return rest; });
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets", matchId, user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (locked) return null;
  if (isLoading) {
    return (
      <div className="border-t border-dashed border-[var(--color-surface-border)] pt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
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

  const tabEnabled: Record<TabId, boolean> = {
    goals: true, cs: true, ex: hasExtras, cards: hasCards, corners: hasCorners, sp: hasSpecials,
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
    if (!rows.length) return <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">Not available.</div>;
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
          />
        )}
      </div>
    );
  };

  // Row layout: [line pill] [Over button] [Under button] used for O/U markets.
  const renderLineRow = (market: MarketKey, lineLabel: string) => {
    const rows = orderedSelections(market, getGroup(market));
    if (!rows.length) return null;
    const suspended = isMarketSuspended(market);
    const pick = picks[market];
    const stake = stakes[market] ?? String(MIN_STAKE);
    const sErr = stakeError(Number(stake));
    const isPending = mut.isPending && mut.variables === market;
    const over = rows.find((r) => r.selection.startsWith("OVER_"));
    const under = rows.find((r) => r.selection.startsWith("UNDER_"));

    const renderSide = (o: OddsRow | undefined, side: "Over" | "Under") => {
      if (!o) return <EmptySide />;
      const isPicked = pick?.selection === o.selection;
      const alreadyPlaced = placedKeys.has(`${market}:${o.selection}`);
      return (
        <OddsButton
          inline
          label={side}
          price={Number(o.odds)}
          selected={isPicked}
          alreadyPlaced={alreadyPlaced}
          disabled={alreadyPlaced || suspended}
          title={suspended ? "Market suspended" : alreadyPlaced ? "You already placed a bet on this selection" : undefined}
          onClick={() => setPicks((prev) => ({
            ...prev,
            [market]: isPicked ? null : { selection: o.selection, odds: Number(o.odds) },
          }))}
        />
      );
    };

    return (
      <div>
        <div className="grid grid-cols-[56px_1fr_1fr] items-stretch gap-2">
          <LinePill line={lineLabel} />
          {renderSide(over, "Over")}
          {renderSide(under, "Under")}
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
          />
        )}
      </div>
    );
  };

  // Inline row for 2-option markets (BTTS, Odd/Even, Red Card, To Qualify, etc.)
  const renderInlineRow = (market: MarketKey) => {
    const rows = orderedSelections(market, getGroup(market));
    if (!rows.length) return null;
    const suspended = isMarketSuspended(market);
    const pick = picks[market];
    const stake = stakes[market] ?? String(MIN_STAKE);
    const sErr = stakeError(Number(stake));
    const isPending = mut.isPending && mut.variables === market;
    const cols = rows.length === 3 ? "grid-cols-3" : "grid-cols-2";
    return (
      <div>
        {suspended && <div className="mb-2"><SuspendedBadge /></div>}
        <div className={`grid ${cols} gap-2`}>
          {rows.map((o) => {
            const isPicked = pick?.selection === o.selection;
            const alreadyPlaced = placedKeys.has(`${market}:${o.selection}`);
            return (
              <OddsButton
                inline
                key={o.id}
                label={selectionLabel(o.selection)}
                price={Number(o.odds)}
                selected={isPicked}
                alreadyPlaced={alreadyPlaced}
                disabled={alreadyPlaced || suspended}
                title={suspended ? "Market suspended" : alreadyPlaced ? "You already placed a bet on this selection" : undefined}
                onClick={() => setPicks((prev) => ({
                  ...prev,
                  [market]: isPicked ? null : { selection: o.selection, odds: Number(o.odds) },
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
          />
        )}
      </div>
    );
  };

  const GroupHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink)]">{children}</div>
  );

  const SubHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{children}</div>
  );



  const renderCorrectScore = () => {
    const rows = orderedSelections("correct_score", getGroup("correct_score"));
    if (!rows.length) return <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">Not available.</div>;
    const selectedKeys = Object.keys(csPicks);
    const pendingSelection = csMut.isPending ? (csMut.variables as string | undefined) : undefined;
    const csSuspended = isMarketSuspended("correct_score");
    return (
      <div>
        {csSuspended && <div className="mb-2"><SuspendedBadge /></div>}
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)] mb-2">
          Tap multiple scores — each gets its own stake.
        </div>
        <div className="grid grid-cols-4 gap-2">
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

        {!csSuspended && selectedKeys.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
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
    <div className="border-t border-dashed border-[var(--color-surface-border)] pt-4 space-y-4 -mx-5 sm:-mx-2 md:mx-0">
      {/* Stencil tab bar — horizontal scroll on mobile so every label renders in full */}
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
              className={`shrink-0 flex-1 min-w-[84px] px-3 py-2.5 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)] last:border-r-0 ${
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
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)] border-l-2 border-[var(--color-neon)]/60 pl-2">
            Settled on full-time card counts. Stake refunded if data unavailable.
          </div>
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
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)] border-l-2 border-[var(--color-neon)]/60 pl-2">
            Settled on full-time corner counts. Stake refunded if data unavailable.
          </div>
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
  );
}
