import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  CopyPlus,
  Hand,
  SplitSquareHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { SettlePlaque, useSettleBeat } from "@/components/arcade/SettlePlaque";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { BlackjackTable, type BlackjackState } from "@/components/arcade/BlackjackTable";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,
} from "@/components/arcade/ControlDock";
import { BlackjackVerifyDialog } from "@/components/arcade/BlackjackVerifyDialog";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { getArcadePersonalBest } from "@/lib/arcade/personal-best.functions";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";
import { ArcadeIdleCue } from "@/components/arcade/ArcadeIdleCue";
import { FairnessPlaque, HudBar, HudPlaque } from "@/components/arcade/ArcadeHud";
import { RecentResultsStrip } from "@/components/arcade/RecentResultsStrip";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  doubleBlackjack,
  getActiveBlackjackHand,
  getBlackjackConfig,
  getBlackjackProfile,
  hitBlackjack,
  splitBlackjack,
  standBlackjack,
  startBlackjackHand,
} from "@/lib/arcade/blackjack.functions";

import * as React from "react";

/** Engraved cabinet plaque bound to this game's theme. */
const Stat = (props: Omit<React.ComponentProps<typeof HudPlaque>, "game">) => (
  <HudPlaque game="blackjack" {...props} />
);


export const Route = createFileRoute("/_authenticated/arcade/blackjack")({
  head: () => ({
    meta: [
      { title: "Blackjack — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair single-player Blackjack. Stake points straight from your wallet, beat the dealer and get paid back into your wallet.",
      },
      { property: "og:title", content: "Blackjack — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Provably fair single-player Blackjack played with wallet points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlackjackPage,
});

const newKey = () => `bj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 14);

/** Matches BlackjackTable's per-card deal stagger. */
const DEAL_STEP_MS = 420;


function BlackjackPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("blackjack");
  const fetchBest = useServerFn(getArcadePersonalBest);
  const bestQ = useQuery({
    queryKey: ["blackjack", "personal-best"],
    queryFn: () => fetchBest({ data: { game: "blackjack" } }),
  });
  const fetchConfig = useServerFn(getBlackjackConfig);
  const fetchProfile = useServerFn(getBlackjackProfile);
  const fetchActive = useServerFn(getActiveBlackjackHand);
  const startFn = useServerFn(startBlackjackHand);
  const hitFn = useServerFn(hitBlackjack);
  const standFn = useServerFn(standBlackjack);
  const doubleFn = useServerFn(doubleBlackjack);
  const splitFn = useServerFn(splitBlackjack);

  const configQ = useQuery({ queryKey: ["blackjack", "config"], queryFn: () => fetchConfig() });
  const profileQ = useQuery({ queryKey: ["blackjack", "profile"], queryFn: () => fetchProfile() });
  const activeQ = useQuery({ queryKey: ["blackjack", "active"], queryFn: () => fetchActive() });

  const [state, setState] = useState<BlackjackState | null>(null);
  const [stake, setStake] = useState(10);
  const [resultOpen, setResultOpen] = useState(false);
  const { beat, run: runBeat } = useSettleBeat(340);
  const [tableBusy, setTableBusy] = useState(false);
  const shownResultRef = useRef<string | null>(null);
  const [recent, setRecent] = useState<
    Array<{ key: string; label: string; tone?: "hot" | "win" | "neutral" | "loss" }>
  >([]);

  const clientSeed = useRef(newSeed());

  useEffect(() => {
    if (!state && activeQ.data?.state) setState(activeQ.data.state as BlackjackState);
  }, [activeQ.data, state]);

  const rules = configQ.data?.rules as any;
  const balance = profileQ.data?.balance ?? 0;
  const minStake = Number(rules?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(rules?.max_stake ?? 100));
  const chips: number[] =
    Array.isArray(rules?.chip_values) && rules.chip_values.length
      ? rules.chip_values.map((c: any) => Number(c))
      : [5, 10, 25, 50, 100];

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const activeHand = useMemo(
    () => (state?.playerHands ?? []).find((h: any) => h.status === "ACTIVE"),
    [state],
  );
  const inPlay = state?.hand?.status === "PLAYER_TURN" && !!activeHand;
  const settled = state?.hand?.status === "COMPLETED";

  // The outcome pop-up waits until every card has finished sliding and
  // flipping — the reveal itself carries the suspense.
  useEffect(() => {
    const h = state?.hand;
    if (!h || h.status !== "COMPLETED") return;
    if (shownResultRef.current === h.id) return;
    // Restart the wait whenever the table reports motion, then open once
    // everything has landed and flipped.
    const t = window.setTimeout(() => {
      if (tableBusy) return;
      shownResultRef.current = h.id;
      const net = Number(h.user_net ?? 0);
      const result = String(h.result ?? "");
      setRecent((prev) =>
        [
          {
            key: String(h.id),
            label:
              result === "BLACKJACK"
                ? "BJ"
                : net > 0
                  ? "W"
                  : net < 0
                    ? "L"
                    : "P",
            tone:
              result === "BLACKJACK" || net > 0
                ? result === "BLACKJACK"
                  ? ("hot" as const)
                  : ("win" as const)
                : net < 0
                  ? ("loss" as const)
                  : ("neutral" as const),
          },
          ...prev,
        ].slice(0, 12),
      );
      if (net === 0) play("chip", { rate: 0.8 });
      // In-table brass plaque lands on the felt before the themed dialog.
      runBeat(() => setResultOpen(true));
    }, 520);
    return () => window.clearTimeout(t);
  }, [state?.hand?.id, state?.hand?.status, tableBusy]);



  // A "snap" per card as it leaves the shoe, staggered to match the deal.
  const seenCardsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const cards = (state?.cards ?? []) as any[];
    const handId = String(state?.hand?.id ?? "");
    if (seenCardsRef.current.size && handId && !cards.some((c) => seenCardsRef.current.has(c.id))) {
      seenCardsRef.current = new Set();
    }
    const fresh = cards.filter((c) => !seenCardsRef.current.has(c.id));
    fresh.forEach((c) => seenCardsRef.current.add(c.id));
    // Card snap per dealt card; the dealer's hole card gets a slower,
    // more deliberate flip beat than the player's cards.
    const timers = fresh.map((c: any, i) =>
      window.setTimeout(() => {
        if (c.is_hole_card || c.isHoleCard) playFor("blackjack", "settle", { rate: 0.85 });
        else playFor("blackjack", "reveal-tick", { rate: 1.05, volume: 0.9 });
      }, i * DEAL_STEP_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.cards]);

  const activeCards = useMemo(
    () => (state?.cards ?? []).filter((c: any) => c.playerHandId === activeHand?.id),
    [state, activeHand],
  );
  const canDouble =
    inPlay &&
    !!rules?.double_allowed &&
    activeCards.length === 2 &&
    !activeHand?.is_doubled &&
    (!activeHand?.is_split || !!rules?.double_after_split) &&
    balance >= Number(activeHand?.stake ?? stake);
  const canSplit =
    inPlay &&
    activeCards.length === 2 &&
    activeCards[0]?.rank != null &&
    activeCards[1]?.rank != null &&
    Math.min(activeCards[0].rank as number, 10) === Math.min(activeCards[1].rank as number, 10) &&
    (state?.playerHands.length ?? 1) < Number(rules?.max_split_hands ?? 4) &&
    balance >= Number(activeHand?.stake ?? stake);

  /** Table state only — safe to refetch mid-animation. */
  const refreshTable = () => {
    qc.invalidateQueries({ queryKey: ["blackjack", "active"] });
  };

  /** Money-facing queries. Held back until the deal/flip has finished. */
  const refreshBalance = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["blackjack", "profile"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  }, [qc]);

  const refresh = () => {
    refreshTable();
    refreshBalance();
  };

  /**
   * The visible balance may only move once every card has landed and
   * flipped — the same rule the other arcade games follow.
   */
  const pendingBalanceRef = useRef(false);
  useEffect(() => {
    if (!pendingBalanceRef.current || tableBusy) return;
    pendingBalanceRef.current = false;
    refreshBalance();
  }, [tableBusy, state?.hand?.state_version, refreshBalance]);

  const onError = (e: any) => {
    toast.error(e?.message ?? "Something went wrong.");
    refresh();
    activeQ.refetch().then((r) => r.data?.state && setState(r.data.state as BlackjackState));
  };

  const applied = (res: any) => {
    setState(res.state as BlackjackState);
    refreshTable();
    // Wallet/profile are refreshed by the effect above once the table has
    // stopped animating; settlement maths is untouched.
    pendingBalanceRef.current = true;
  };

  const deal = useMutation({
    mutationFn: () =>
      startFn({ data: { stake, clientSeed: clientSeed.current, idempotencyKey: newKey() } }),
    onSuccess: applied,
    onError,
  });

  const actionArgs = () => ({
    handId: state!.hand.id,
    playerHandId: activeHand!.id,
    stateVersion: state!.hand.state_version,
    idempotencyKey: newKey(),
  });

  const hit = useMutation({ mutationFn: () => hitFn({ data: actionArgs() }), onSuccess: applied, onError });
  const stand = useMutation({ mutationFn: () => standFn({ data: actionArgs() }), onSuccess: applied, onError });
  const dbl = useMutation({ mutationFn: () => doubleFn({ data: actionArgs() }), onSuccess: applied, onError });
  const split = useMutation({ mutationFn: () => splitFn({ data: actionArgs() }), onSuccess: applied, onError });

  const busy =
    tableBusy ||
    deal.isPending ||
    hit.isPending ||
    stand.isPending ||
    dbl.isPending ||
    split.isPending;

  const handleBusy = useCallback((b: boolean) => setTableBusy(b), []);


  const canDeal =
    !busy && !rules?.maintenance_mode && balance >= stake && stake >= minStake && stake <= maxStake;

  const clampStake = (v: number) => setStake(Math.max(minStake, Math.min(maxStake, Math.round(v))));

  const lastResult = settled ? state?.hand : null;
  const todayNet = profileQ.data?.todayNet ?? 0;

  return (
    <div className="flex flex-col gap-1 md:gap-3">
      <HudBar game="blackjack">
        <Stat
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} maximumFractionDigits={0} />}
        />
        <Stat
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${todayNet.toLocaleString()}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque
          game="blackjack"
          rtpLabel={arcadeFairness("blackjack").rtpLabel}
          tag="Fair"
        />
      </HudBar>

      {rules?.maintenance_mode && (
        <div className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {rules.announcement ?? "Blackjack is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="blackjack" />
        <ArcadeStage game="blackjack" className="relative z-10">
          <ArcadeEntrance game="blackjack" className="relative w-full">
            <MiniCabinetTitle game="blackjack" title="Blackjack" />
            <div className="relative h-[340px] w-full md:h-[500px]">
            <SettlePlaque
              game="blackjack"
              show={beat}
              label={String(state?.hand?.result ?? "Result").replace("_", " ")}
              value={`${Number(state?.hand?.user_net ?? 0) > 0 ? "+" : ""}${Number(
                state?.hand?.user_net ?? 0,
              ).toLocaleString()}`}
            />
            <BlackjackTable state={state} onBusyChange={handleBusy} />
            <ArcadeIdleCue game="blackjack" show={!inPlay && !busy && !resultOpen}>
              {settled ? "Deal again when ready" : "Select stake · Deal"}
            </ArcadeIdleCue>
          </ArcadeEntrance>
        </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="blackjack"
        empty="No hands yet"
        items={recent}
        trailing={
          lastResult ? (
            <BlackjackVerifyDialog
              handId={lastResult.id}
              serverSeedHash={lastResult.server_seed_hash}
              clientSeed={lastResult.client_seed}
              nonce={lastResult.nonce}
            />
          ) : null
        }
      />

      {lastResult && (
        <ArcadeResultDialog
          game="blackjack"
          open={resultOpen}
          onOpenChange={setResultOpen}
          tone={
            Number(lastResult.user_net) > 0
              ? "win"
              : Number(lastResult.user_net) < 0
                ? "loss"
                : "push"
          }
          headline={
            Number(lastResult.user_net) > 0
              ? String(lastResult.result) === "BLACKJACK"
                ? "Blackjack!"
                : "You win"
              : Number(lastResult.user_net) < 0
                ? "Dealer wins"
                : "Push"
          }
          net={Number(lastResult.user_net ?? 0)}
          stake={Number((state?.playerHands ?? [])[0]?.stake ?? stake)}
          detail={String(lastResult.result ?? "").replace("_", " ")}
          footer={
            <BlackjackVerifyDialog
              handId={lastResult.id}
              serverSeedHash={lastResult.server_seed_hash}
              clientSeed={lastResult.client_seed}
              nonce={lastResult.nonce}
            />
          }
        />
      )}

      <ControlDock game="blackjack" maxWidth="max-w-xl">
        <DockRow scroll>
          <ChipRack
            game="blackjack"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={inPlay || busy}
            onSelect={(c) => clampStake(c)}
            size={44}
          />
          {!inPlay && (
            <DockReadout
              className="ml-1"
              label="Stake"
              value={`${stake.toLocaleString()} pts`}
              hint="Win 2× · BJ 2.5×"
            />
          )}
          <div className="mx-1 h-8 w-px shrink-0 bg-[var(--color-surface-border)]" />
          <div className="flex shrink-0 items-center gap-1.5">
            <ActionBtn
              label="2×"
              title="Double"
              onClick={() => dbl.mutate()}
              disabled={!inPlay || busy || !canDouble}
              loading={dbl.isPending}
              icon={<span className="font-mono text-[13px] font-black">2×</span>}
            />
            <ActionBtn
              label="Hit"
              onClick={() => hit.mutate()}
              disabled={!inPlay || busy}
              loading={hit.isPending}
              icon={<CopyPlus className="h-4 w-4" />}
            />
            <ActionBtn
              label="Stand"
              onClick={() => stand.mutate()}
              disabled={!inPlay || busy}
              loading={stand.isPending}
              icon={<Hand className="h-4 w-4" />}
            />
            <ActionBtn
              label="Split"
              onClick={() => split.mutate()}
              disabled={!inPlay || busy || !canSplit}
              loading={split.isPending}
              icon={<SplitSquareHorizontal className="h-4 w-4" />}
            />
          </div>
        </DockRow>

        {!inPlay ? (
          <DockPrimary
            onClick={() => {
              play("button");
              deal.mutate();
            }}
            disabled={!canDeal}
            loading={deal.isPending}
          >
            {settled ? "DEAL AGAIN" : "PLAY"}
          </DockPrimary>
        ) : (
          <div className="flex h-[52px] w-full items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            {tableBusy ? "Dealing…" : "Your move"}
          </div>
        )}

        {balance < stake && !inPlay && <DockNote>Not enough points for this stake</DockNote>}
      </ControlDock>
    </div>
  );
}

function ActionBtn({
  label,
  title,
  icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title ?? label}
      className={cn(
        "flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-neon)] transition active:scale-[0.97]",
        (disabled || loading) && "pointer-events-none opacity-40",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span className="font-display text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink)]">
        {label}
      </span>
    </button>
  );
}

