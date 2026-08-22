import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CommentThread } from "@/components/social/CommentThread";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, ArrowLeft, ArrowUpRight, X } from "lucide-react";
import { toast } from "sonner";
import { getF1Race, placeF1RaceBet, getF1LiveRaceState } from "../f1.functions";
import { MarketAnalyticsCard } from "@/components/matches/MarketAnalyticsCard";
import { getF1CardMarketHistory, getF1CardRecentTrades } from "../f1-market-history.functions";
import { LiveRaceStats } from "../components/LiveRaceStats";
import { F1PostRaceAnalytics } from "../components/F1PostRaceAnalytics";
import { getMyWallet } from "@/lib/wallet.functions";
import { useAuth } from "@/hooks/use-auth";
import { PageFooter } from "@/components/ui/page-footer";
import { F1Badge } from "@/components/brand/SportBadge";

type TopTab = "top_finishers" | "race_specials";
type SubTab =
  | "top_5_finish"
  | "podium"
  | "points_finish"
  | "head_to_head"
  | "fastest_lap"
  | "top_constructor_race";
const SUB_TABS_TOP: { id: SubTab; label: string }[] = [
  { id: "top_5_finish", label: "Top 5 Finishers" },
  { id: "podium", label: "Podium Finishers" },
  { id: "points_finish", label: "Top 10 Finishers" },
];

const SUB_TABS_SPECIALS: { id: SubTab; label: string }[] = [
  { id: "head_to_head", label: "Teammate H2H" },
  { id: "fastest_lap", label: "Fastest Lap" },
  { id: "top_constructor_race", label: "Top Constructor" },
];

const MIN_STAKE = 10;
const MAX_STAKE = 50000;

function impliedPct(odds: number) {
  if (!odds || odds <= 1) return 0;
  return Math.round((1 / odds) * 100);
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

export function F1RaceDetailsPage({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const place = useServerFn(placeF1RaceBet);
  const walletFn = useServerFn(getMyWallet);
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["f1-race", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    refetchInterval: 30_000,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id,
    staleTime: 15_000,
  });
  const balance = Number(wallet.data?.balance ?? 0);

  const [topTab, setTopTab] = useState<TopTab>("top_finishers");
  const [subTab, setSubTab] = useState<SubTab>("top_5_finish");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSubTab(topTab === "top_finishers" ? "top_5_finish" : "head_to_head");
    setSelectedId(null);
  }, [topTab]);

  useEffect(() => {
    setSelectedId(null);
  }, [subTab]);

  const race: any = q.data?.race;
  const drivers: any[] = q.data?.drivers ?? [];
  const teams: any[] = q.data?.teams ?? [];
  const teamByKey = useMemo(() => Object.fromEntries(teams.map((t) => [t.team_key, t])), [teams]);
  const driverByKey = useMemo(() => Object.fromEntries(drivers.map((d) => [d.driver_key, d])), [drivers]);

  const grouped = useMemo(() => {
    const g: Record<SubTab, any[]> = {
      top_5_finish: [],
      podium: [],
      points_finish: [],
      head_to_head: [],
      fastest_lap: [],
      top_constructor_race: [],
    };
    for (const m of q.data?.markets ?? []) (g[m.market_type as SubTab] ??= []).push(m);
    for (const k of Object.keys(g) as SubTab[]) g[k].sort((a, b) => Number(a.odds) - Number(b.odds));
    return g;
  }, [q.data]);

  const currentMarkets = grouped[subTab];

  const placeMut = useMutation({
    mutationFn: async (stakeValue: number) => {
      const m = currentMarkets.find((x) => x.id === selectedId);
      if (!m) throw new Error("No selection");
      if (!Number.isFinite(stakeValue) || stakeValue < MIN_STAKE) throw new Error(`Minimum stake is ${MIN_STAKE} points.`);
      if (stakeValue > MAX_STAKE) throw new Error(`Maximum stake is ${MAX_STAKE.toLocaleString()} points.`);
      if (stakeValue > balance) throw new Error("Insufficient points");
      return place({ data: { marketId: m.id, stake: stakeValue, maxOdds: Number(m.odds) * 1.05 } });
    },
    onSuccess: () => {
      toast.success("Prediction locked");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["f1-race", raceId] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Keep the last non-null selection alive across background refetches so the slip
  // (and its focused input) never briefly unmounts mid-typing. Must be declared
  // before any early returns to keep hook order stable.
  const stickyMarketRef = useRef<any>(null);

  if (q.isLoading)
    return (
      <div className="p-6">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!race) return <div className="p-6 text-center text-sm">Race not found.</div>;

  const bettingClosed: boolean = !!q.data?.bettingClosed;
  const marketsSuspended: boolean = !!(q.data as any)?.marketsSuspended;
  const isLive: boolean = !!q.data?.isLive;
  const effectiveSelectedId = bettingClosed ? null : selectedId;
  const selectedMarket = currentMarkets.find((x) => x.id === effectiveSelectedId) ?? null;
  if (selectedMarket) stickyMarketRef.current = selectedMarket;
  const slipMarket = selectedMarket ?? stickyMarketRef.current;
  const selectedDriver = slipMarket ? driverByKey[slipMarket.selection_key] : null;
  const noBalance = balance <= 0;


  return (
    <div
      className="mx-auto max-w-3xl px-4 pt-4"
      style={{ paddingBottom: selectedMarket ? "calc(env(safe-area-inset-bottom) + 22rem)" : "3rem" }}
    >
      <Link
        to="/f1/races"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-3 w-3" /> All races
      </Link>

      {/* Header */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
          <F1Badge size={32} />
          <span>F1 · Round {race.round}</span>
        </div>
        <h1 className="font-display text-3xl font-black leading-[1.05] tracking-tight text-[var(--color-ink)]">
          {race.name}
        </h1>
        <div className="mt-3 text-sm text-[var(--color-ink-muted)]">{formatBegin(race.starts_at)}</div>
      </div>

      {isLive && <LiveRaceStats raceId={raceId} />}



      <MarketAnalyticsCard
        matchId={raceId}
        historyFn={getF1CardMarketHistory}
        tradesFn={getF1CardRecentTrades}
        queryNamespace="f1"
        realtime
      />

      <div className="mb-4 mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-surface-border)] to-transparent" />


      {marketsSuspended && (
        <div className="mb-4 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            Markets suspended
          </div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
            F1 betting is paused while we connect a verified odds provider. Race data, standings and
            results stay live, and any bets you already placed settle as normal.
          </p>
        </div>
      )}

      {bettingClosed ? (
        <F1YourPicksSummary raceId={raceId} raceName={race.name} finished={race.status === "finished"} />
      ) : (<>
      {/* Top tabs */}
      <div className="mb-4 flex items-baseline gap-6">
        {(
          [
            { id: "top_finishers", label: "Top Finishers" },
            { id: "race_specials", label: "Race Specials" },
          ] as { id: TopTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className={`text-lg font-bold transition-colors ${
              topTab === t.id ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]/60 hover:text-[var(--color-ink-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs — segmented bar (matches UFC / football MarketTabs) */}
      <div className="mb-6 -mx-4 md:mx-0">
        <div
          role="tablist"
          aria-label="Market categories"
          className="flex overflow-x-auto rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(topTab === "top_finishers" ? SUB_TABS_TOP : SUB_TABS_SPECIALS).map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(t.id)}
                className={`shrink-0 flex-1 px-4 py-2.5 text-center text-[13px] font-semibold whitespace-nowrap transition-colors border-r border-[var(--color-surface-border)]/60 last:border-r-0 ${
                  active
                    ? "bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[inset_0_-2px_0_0_var(--color-neon)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>


      {/* Full market list */}
      <div className="divide-y divide-[var(--color-surface-border)]/60">
        {currentMarkets.length === 0 && (
          <div className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
            No markets in this category yet.
          </div>
        )}

        {subTab === "head_to_head" ? (
          (() => {
            // Group the two rows of each pairing (A-beats-B, B-beats-A) into one card.
            const pairs = new Map<string, { yes: any; no: any }>();
            for (const m of currentMarkets) {
              const a = m.selection_key as string;
              const b = m.secondary_selection_key as string;
              if (!a || !b) continue;
              const key = [a, b].sort().join("|");
              const bucket = pairs.get(key) ?? ({} as { yes: any; no: any });
              // Favorite (lowest odds) becomes the "yes" side so the question reads naturally.
              if (!bucket.yes || Number(m.odds) < Number(bucket.yes.odds)) {
                if (bucket.yes) bucket.no = bucket.yes;
                bucket.yes = m;
              } else {
                bucket.no = m;
              }
              pairs.set(key, bucket);
            }
            const list = [...pairs.values()].filter((p) => p.yes && p.no);
            return list.map(({ yes, no }) => {
              const drvA = driverByKey[yes.selection_key];
              const drvB = driverByKey[yes.secondary_selection_key];
              const teamA = drvA?.team_key ? teamByKey[drvA.team_key] : null;
              const nameA = drvA?.name ?? yes.selection_key;
              const nameB = drvB?.name ?? yes.secondary_selection_key;
              const yesSel = selectedId === yes.id;
              const noSel = selectedId === no.id;
              return (
                <div key={yes.id} className="py-3">
                  {teamA?.name && (
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      {teamA.name}
                    </div>
                  )}
                  <div className="mb-2.5 text-sm font-semibold text-[var(--color-ink)]">
                    Will {nameA} beat {nameB}?
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={bettingClosed}
                      onClick={() => setSelectedId(yes.id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 bg-black/40 px-3 py-4 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        yesSel
                          ? "border-sky-500 ring-2 ring-sky-500/60 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
                          : "border-[var(--color-surface-border)] hover:border-sky-500/60"
                      }`}
                    >
                      <span className="text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">
                        Yes
                      </span>
                      <span className="font-display text-2xl font-black tabular-nums text-[var(--color-neon)]">
                        {Number(yes.odds).toFixed(2)}
                        <span className="text-base">x</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={bettingClosed}
                      onClick={() => setSelectedId(no.id)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 bg-black/40 px-3 py-4 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        noSel
                          ? "border-red-500 ring-2 ring-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                          : "border-[var(--color-surface-border)] hover:border-red-500/60"
                      }`}
                    >
                      <span className="text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">
                        No
                      </span>
                      <span className="font-display text-2xl font-black tabular-nums text-[var(--color-neon)]">
                        {Number(no.odds).toFixed(2)}
                        <span className="text-base">x</span>
                      </span>
                    </button>
                  </div>
                </div>
              );
            });
          })()
        ) : (
          currentMarkets.map((m: any) => {
            const isConstructor = subTab === "top_constructor_race";
            const team = isConstructor ? teamByKey[m.selection_key] : null;
            const drv = !isConstructor ? driverByKey[m.selection_key] : null;
            const drvTeam = drv?.team_key ? teamByKey[drv.team_key] : null;
            
            const isSel = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={bettingClosed}
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-center gap-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSel ? "bg-[var(--color-neon)]/5" : ""
                }`}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)] ring-1 ring-[var(--color-surface-border)]/60">
                  {isConstructor ? (
                    team?.logo_url ? (
                      <img src={team.logo_url} alt={m.label} className="h-full w-full object-contain p-1" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[10px] font-bold text-[var(--color-ink-muted)]">
                        {m.label.slice(0, 3).toUpperCase()}
                      </div>
                    )
                  ) : drv?.photo_url ? (
                    <img src={drv.photo_url} alt={m.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] font-bold text-[var(--color-ink-muted)]">
                      {(drv?.abbr ?? m.label.slice(0, 3)).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
                    {isConstructor ? (team?.name ?? m.label) : (drv?.name ?? m.label)}
                  </div>
                  <div className="truncate text-xs text-[var(--color-ink-muted)]">
                    {isConstructor ? "Constructor" : (drvTeam?.name ?? "")}
                  </div>
                </div>
                <div className="font-display tabular-nums text-lg font-bold text-[var(--color-neon)]">
                  {Number(m.odds).toFixed(2)}<span className="text-sm">x</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-8 rounded-lg border border-[var(--color-neon)]/30 bg-[var(--color-neon)]/5 p-4 text-sm">
        <span className="font-bold text-[var(--color-ink)]">Important information:</span>{" "}
        <span className="text-[var(--color-ink-muted)]">
          F1 races settle after the FIA posts the Final Race Classification.
        </span>
      </div>
      </>)}


      {/* Your position — always mounted so the stake input never remounts mid-typing. */}
      <F1BetSlip
        isOpen={!!selectedMarket}
        market={slipMarket}
        driverName={selectedDriver?.name ?? null}
        raceName={race.name}
        balance={balance}
        noBalance={noBalance}
        isPending={placeMut.isPending}
        onClear={() => setSelectedId(null)}
        onSubmit={(n: number) => placeMut.mutate(n)}
      />

      {race.status === "finished" && <F1PostRaceAnalytics raceId={raceId} />}

      <div className="mt-8">
        <CommentThread eventKind="f1" eventId={raceId} />
      </div>

      <PageFooter />
    </div>
  );
}

type F1BetSlipProps = {
  isOpen: boolean;
  market: any | null;
  driverName: string | null;
  raceName: string;
  sectionTitle?: string;
  balance: number;
  noBalance: boolean;
  isPending: boolean;
  onClear: () => void;
  onSubmit: (stake: number) => void;
};

const F1BetSlip = memo(function F1BetSlip({
  isOpen,
  market,
  driverName,
  raceName,
  sectionTitle,
  balance,
  noBalance,
  isPending,
  onClear,
  onSubmit,
}: F1BetSlipProps) {
  const [stake, setStake] = useState<string>("100");
  const stakeNum = Number(stake) || 0;
  const odds = market ? Number(market.odds) : 0;
  const potentialReturn = market ? stakeNum * odds : 0;
  const potentialGain = potentialReturn - stakeNum;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const stakeError =
    !Number.isFinite(stakeNum) || stakeNum < MIN_STAKE
      ? `Min ${MIN_STAKE} pts`
      : stakeNum > MAX_STAKE
      ? `Max ${MAX_STAKE.toLocaleString()} pts`
      : null;
  const canSubmit = !!market && !isPending && !stakeError && !noBalance && !overBalance;

  return (
    <div
      aria-hidden={!isOpen}
      className="fixed inset-x-0 z-50 mx-auto max-w-2xl space-y-2.5 rounded-t-lg border border-[var(--color-neon)]/40 bg-[#050A08]/98 p-3.5 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] backdrop-blur"
      style={{
        bottom: "calc(72px + env(safe-area-inset-bottom))",
        paddingBottom: "0.875rem",
        display: isOpen && market ? undefined : "none",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
            Your prediction
          </div>
          <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
            {raceName}{sectionTitle ? ` · ${sectionTitle}` : ""}
          </div>
          {market && (
            <div className="text-[13px] leading-snug text-[var(--color-ink)]">
              <span className="font-semibold">{driverName ?? market.label}</span>
              <span className="mx-1.5 text-[var(--color-ink-muted)]">·</span>
              <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
                {odds.toFixed(2)}x
              </span>
              <span className="ml-1.5 text-[11px] text-[var(--color-ink-muted)]">
                market estimate ~{impliedPct(odds)}%
              </span>
            </div>
          )}
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
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={stake}
          onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
          disabled={noBalance}
          placeholder={`Points (${MIN_STAKE}-${MAX_STAKE.toLocaleString()})`}
          className="flex-1 min-w-0 rounded-md border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(stakeNum)}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-border)] disabled:text-[var(--color-ink-muted)] disabled:opacity-40"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span>
                {noBalance
                  ? "Add Points to Lock"
                  : overBalance
                  ? "Stake exceeds balance"
                  : "Lock Prediction"}
              </span>
              {canSubmit && <ArrowUpRight className="h-3.5 w-3.5" />}
            </>
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
          <span className="font-bold tabular-nums text-[var(--color-ink)]">{balance.toFixed(2)}</span>
        </span>
        {noBalance && <span className="font-semibold text-destructive">Add points to lock this prediction.</span>}
        {!noBalance && overBalance && (
          <span className="font-semibold text-destructive">Stake exceeds points balance</span>
        )}
        {!noBalance && !overBalance && stakeError && (
          <span className="font-semibold text-destructive">{stakeError}</span>
        )}
      </div>
    </div>
  );
});


function F1YourPicksSummary({ raceId, raceName, finished }: { raceId: string; raceName: string; finished: boolean }) {
  const { user } = useAuth();
  const uid = user?.id;
  const { data } = useQuery({
    queryKey: ["f1-race-user-picks", raceId, uid],
    enabled: !!uid,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("f1_bets")
        .select("id, market_type, selection_label, selection_key, stake, potential_payout, odds_locked, status, created_at")
        .eq("user_id", uid!)
        .eq("race_id", raceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const picks = data ?? [];
  const returnedFor = (p: any) =>
    p.status === "won"
      ? Number(p.potential_payout || 0)
      : p.status === "void" || p.status === "cancelled" || p.status === "refunded"
        ? Number(p.stake || 0)
        : 0;
  const totalStake = picks.reduce((s, p) => s + Number(p.stake || 0), 0);
  const totalPayout = picks.reduce((s, p) => s + returnedFor(p), 0);
  const wins = picks.filter((p) => p.status === "won").length;
  const losses = picks.filter((p) => p.status === "lost").length;
  const voids = picks.filter((p) => p.status === "void" || p.status === "cancelled" || p.status === "refunded").length;
  const pnl = totalPayout - totalStake;

  return (
    <div className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]">
          {finished ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-muted)]" />
          ) : (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
          )}
          <span className={finished ? "text-[var(--color-ink-muted)]" : "text-destructive"}>
            {finished ? "Your picks · settled" : "Your picks · in play"}
          </span>
        </div>
        {picks.length > 0 && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
            {picks.length} pick{picks.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {picks.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          You didn't place any predictions on {raceName}.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 border-b border-dashed border-[var(--color-surface-border)] pb-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Staked</div>
              <div className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">{totalStake.toLocaleString()} pts</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Returned</div>
              <div className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">{totalPayout.toLocaleString()} pts</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Net</div>
              <div className={`font-display text-sm font-bold tabular-nums ${pnl > 0 ? "text-[var(--color-neon)]" : pnl < 0 ? "text-destructive" : "text-[var(--color-ink)]"}`}>
                {pnl >= 0 ? "+" : ""}{pnl.toLocaleString()} pts
              </div>
            </div>
          </div>
          {finished && (
            <div className="mb-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em]">
              <span className="text-[var(--color-neon)]">{wins} won</span>
              <span className="text-[var(--color-ink-muted)]">·</span>
              <span className="text-destructive/80">{losses} lost</span>
              {voids > 0 && (<><span className="text-[var(--color-ink-muted)]">·</span><span className="text-[var(--color-ink-muted)]">{voids} void</span></>)}
            </div>
          )}
          <div className="divide-y divide-[var(--color-surface-border)]/60">
            {picks.map((p) => {
              const stake = Number(p.stake || 0);
              const payout = returnedFor(p);
              const tone = p.status === "won" ? "text-[var(--color-neon)]" : p.status === "lost" ? "text-destructive" : "text-[var(--color-ink-muted)]";
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                      {p.selection_label ?? p.selection_key}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                      {p.market_type?.replace(/_/g, " ")} · @{Number(p.odds_locked || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${tone}`}>{p.status}</div>
                    <div className="font-display text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                      {stake.toLocaleString()} → {payout.toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


