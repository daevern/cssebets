import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPlinkoConfig, getPlinkoProfile, placePlinkoDrop } from "@/lib/arcade/plinko.functions";
import { placePlinkoDropBatch } from "@/lib/arcade/plinko-phase2.functions";
import { PlinkoBoard } from "@/components/arcade/PlinkoBoard";
import { getEquippedCosmetics } from "@/lib/arcade/plinko-cosmetics.functions";
import { HowItWorksDialog } from "@/components/arcade/HowItWorksDialog";
import { VerifyDialog } from "@/components/arcade/VerifyDialog";
import type { PlinkoGame, RiskMode, RowsCount } from "@/components/arcade/types";
import { Minus, Plus, ShieldCheck } from "lucide-react";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockField,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,

} from "@/components/arcade/ControlDock";
import { cn } from "@/lib/utils";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound, winSfxForRatio } from "@/lib/arcade/sound";
import { getArcadePersonalBest } from "@/lib/arcade/personal-best.functions";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";

import * as React from "react";
import { HudPlaque } from "@/components/arcade/ArcadeHud";

/** Engraved cabinet plaque bound to this game's theme. */
const Stat = (props: Omit<React.ComponentProps<typeof HudPlaque>, "game">) => (
  <HudPlaque game="plinko" {...props} />
);



export const Route = createFileRoute("/_authenticated/arcade/plinko")({
  head: () => ({
    meta: [
      { title: "Plinko — cssebets Arcade" },
      {
        name: "description",
        content: "Drop the ball. Stake per drop, provably fair multipliers, instant payouts.",
      },
      { property: "og:title", content: "Plinko — cssebets Arcade" },
      {
        property: "og:description",
        content: "Drop the ball. Stake per drop, provably fair multipliers, instant payouts.",
      },
    ],
  }),
  component: PlinkoPage,
});

const ROW_OPTIONS: RowsCount[] = [8, 10, 12, 14, 16];
const RISK_OPTIONS: { key: RiskMode; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Med" },
  { key: "high", label: "High" },
];
const STAKE_MIN = 1;
const STAKE_MAX = 100;
const BALLS_MIN = 1;
const BALLS_MAX = 100;
const CHIP_VALUES = [1, 5, 10, 25, 50, 100];
type BetMode = "manual" | "auto";

function randHex(bytes = 8) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt = (n: number) => nf.format(n);

function PlinkoPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound();
  const configFn = useServerFn(getPlinkoConfig);
  const profileFn = useServerFn(getPlinkoProfile);
  const dropFn = useServerFn(placePlinkoDrop);
  const batchFn = useServerFn(placePlinkoDropBatch);
  const equippedFn = useServerFn(getEquippedCosmetics);

  const config = useQuery({ queryKey: ["plinko-config"], queryFn: () => configFn({}) });
  const profile = useQuery({
    queryKey: ["plinko-profile"],
    queryFn: () => profileFn({}),
    refetchOnWindowFocus: true,
  });
  const equipped = useQuery({ queryKey: ["plinko-equipped"], queryFn: () => equippedFn({}) });
  const bestFn = useServerFn(getArcadePersonalBest);
  const bestQ = useQuery({
    queryKey: ["plinko", "personal-best"],
    queryFn: () => bestFn({ data: { game: "plinko" } }),
  });

  const [rows, setRows] = useState<RowsCount>(10);
  const [riskMode, setRiskMode] = useState<RiskMode>("medium");
  const [stakePerBall, setStakePerBall] = useState<number>(1);
  const [ballCount, setBallCount] = useState<number>(1);
  const [ballCountInput, setBallCountInput] = useState<string>("1");
  const [mode, setMode] = useState<BetMode>("manual");
  const [clientSeed] = useState<string>(() => randHex(12));
  const [lastGame, setLastGame] = useState<PlinkoGame | null>(null);
  const [activeBalls, setActiveBalls] = useState<
    { id: string; path: number[]; landingSlot: number; startDelayMs: number }[]
  >([]);
  const gamesById = useRef<Map<string, PlinkoGame>>(new Map());
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  const inflightKey = useRef<string | null>(null);

  useEffect(() => {
    setBallCountInput(String(ballCount));
  }, [ballCount]);

  const commitBallCount = (raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return setBallCount(1);
    setBallCount(Math.min(BALLS_MAX, Math.max(BALLS_MIN, n)));
  };

  const currentProfile = useMemo(
    () => (config.data?.profiles ?? []).find((p) => p.rows === rows && p.risk_mode === riskMode),
    [config.data, rows, riskMode],
  );
  const slots = currentProfile?.slots ?? [];
  const maxMult = useMemo(
    () => slots.reduce((m: number, s: any) => Math.max(m, Number(s?.multiplier ?? 0)), 0),
    [slots],
  );

  const balance = profile.data?.balance ?? 0;
  const totalCost = Math.round(stakePerBall * ballCount * 100) / 100;
  const canAfford = balance >= totalCost;
  const busy = activeBalls.length > 0;


  const adjustBalance = (delta: number) => {
    qc.setQueryData(["plinko-profile"], (prev: any) => {
      if (!prev) return prev;
      return { ...prev, balance: Math.max(0, Number(prev.balance ?? 0) + delta) };
    });
  };

  const STAGGER_MS = 110;

  const launchGames = (games: PlinkoGame[]) => {
    if (games.length === 0) return;
    const totalStake = games.reduce((s, g) => s + Number(g.stake_per_ball ?? stakePerBall), 0);
    adjustBalance(-totalStake);
    const additions: typeof activeBalls = [];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      gamesById.current.set(g.id, g);
      additions.push({
        id: g.id,
        path: g.path as number[],
        landingSlot: g.landing_slot,
        startDelayMs: i * STAGGER_MS,
      });
    }
    setActiveBalls((prev) => [...prev, ...additions]);
    setLastGame(games[games.length - 1]);
  };

  const drop = useMutation({
    mutationFn: async () => {
      if (inflightKey.current) throw new Error("A drop is already in progress.");
      const idempotencyKey = `${Date.now()}-${randHex(6)}`;
      inflightKey.current = idempotencyKey;
      try {
        return await dropFn({ data: { rows, riskMode, stakePerBall, clientSeed, idempotencyKey } });
      } finally {
        inflightKey.current = null;
      }
    },
    onSuccess: (res) => {
      play("chip");
      launchGames([(res as any).game as PlinkoGame]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Drop failed"),
  });

  const dropBatch = useMutation({
    mutationFn: async () => {
      if (inflightKey.current) throw new Error("A drop is already in progress.");
      const batchKey = `${Date.now()}-${randHex(6)}`;
      inflightKey.current = batchKey;
      try {
        return await batchFn({
          data: { rows, riskMode, stakePerBall, clientSeed, batchKey, count: ballCount },
        });
      } finally {
        inflightKey.current = null;
      }
    },
    onSuccess: (res) => {
      play("chip");
      launchGames(((res as any).games ?? []) as PlinkoGame[]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Batch drop failed"),
  });

  const placeBet = () => {
    play("button");
    if (ballCount === 1) drop.mutate();
    else dropBatch.mutate();
  };

  const onBallLanded = (id: string) => {
    const g = gamesById.current.get(id);
    if (g) {
      const m = Number(g.multiplier ?? 0);
      // Mechanical peg-tick under the payout chime keeps Plinko kinetic.
      playFor("plinko", "settle", { rate: 0.9 + Math.min(0.6, m / 20) });
      if (m > 0) play(winSfxForRatio(m));
      else play("loss");
      setRecent((r) => [m, ...r].slice(0, 14));
      const payout = Number(g.payout ?? 0);
      if (payout > 0) adjustBalance(payout);
      setLastGame(g);
    }
    setActiveBalls((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (next.length === 0) qc.invalidateQueries({ queryKey: ["plinko-profile"] });
      return next;
    });
    gamesById.current.delete(id);
  };

  const pending = drop.isPending || dropBatch.isPending;
  const canDrop = !pending && canAfford && stakePerBall >= STAKE_MIN;
  const locked = busy || pending;

  return (
    <div className="flex flex-col gap-2">
      <div className="sticky top-14 z-20 -mx-3 rounded-b-xl bg-black/50 px-3 py-1.5 backdrop-blur-md md:top-16 flex items-start gap-1.5">
        <div className="grid flex-1 grid-cols-4 gap-1.5">
            <Stat label="Balance" value={<AnimatedBalance value={balance} />} />
          <Stat label="Max win" value={`${maxMult.toFixed(maxMult >= 100 ? 0 : 1)}×`} />
          <Stat
            label="Last"
            value={
              lastGame && !busy
                ? `${Number(lastGame.multiplier ?? 0).toFixed(2)}×`
                : busy
                  ? "In play"
                  : "—"
            }
          />
          <Stat
            label="Highest multiplier"
            value={`${Number(bestQ.data?.value ?? 0).toFixed(2)}×`}
          />
        </div>
        <div className="flex w-14 shrink-0 flex-col items-stretch gap-1">
          <HowItWorksDialog
            rows={rows}
            riskMode={riskMode}
            slots={slots}
            configVersion={currentProfile?.version}
          />
        </div>
      </div>


      {/* Colour spill lives OUTSIDE the stage: ArcadeStage clips its children. */}
      <div className="relative isolate">
      <ArcadeGlow game="plinko" />
      <ArcadeStage className="relative z-10">
      <ArcadeEntrance game="plinko">
        <div className="relative flex flex-col justify-start">
        <div
          className="arcade-stage relative w-full overflow-hidden rounded-2xl max-md:rounded-none"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent 0%, #000 2.5%, #000 97.5%, transparent 100%)",
          }}
        >
          <PlinkoBoard
            rows={rows}
            slots={slots}
            activeBalls={activeBalls}
            onBallLanded={onBallLanded}
            reducedMotion={
              typeof window !== "undefined" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches
            }
            ballColor={equipped.data?.ball?.preview_color ?? null}
            ballAccent={equipped.data?.ball?.preview_accent ?? null}
            boardColor={equipped.data?.board?.preview_color ?? null}
            boardAccent={equipped.data?.board?.preview_accent ?? null}
            riskOptions={RISK_OPTIONS.map((r) => ({ key: r.key, label: r.label }))}
            risk={riskMode}
            onRiskChange={(v) => setRiskMode(v as RiskMode)}
            modeOptions={[
              { key: "manual", label: "Manual" },
              { key: "auto", label: "Auto" },
            ]}
            mode={mode}
            onModeChange={(v) => setMode(v as BetMode)}
            rowOptions={ROW_OPTIONS}
            onRowsChange={(r) => setRows(r as RowsCount)}
            controlsDisabled={locked}
          />
          {/* Soft edge fade so the cabinet dissolves into the page instead of ending in a hard box. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 md:hidden"
            style={{
              background:
                "linear-gradient(to bottom, rgba(7,8,13,0) 0%, rgba(7,8,13,0.55) 55%, rgba(7,8,13,0.95) 100%)",
            }}
          />
        </div>



        <div className="mt-2 flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recent.length === 0 ? (
            <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              No drops yet
            </span>
          ) : (
            recent.map((m, i) => (
              <span
                key={i}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums",
                  m >= 5
                    ? "bg-[var(--color-neon)] text-black"
                    : m >= 1
                      ? "bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                      : "bg-[#161c22] text-[var(--color-ink-muted)] ring-1 ring-[var(--color-surface-border)]",
                )}
              >
                {m.toFixed(m >= 100 ? 0 : 2)}×
              </span>
            ))
          )}
          {lastGame && !busy && (
            <button
              type="button"
              onClick={() => setVerifyOpen(true)}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-neon)]/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]"
            >
              <ShieldCheck className="h-3 w-3" /> Verify
            </button>
          )}
        </div>
      </div>
      </ArcadeEntrance>
      </ArcadeStage>
      </div>



      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} gameId={lastGame?.id ?? null} />

      <ControlDock game="plinko">

        <DockRow scroll>
          <ChipRack
            values={CHIP_VALUES}
            max={STAKE_MAX}
            value={stakePerBall}
            disabled={locked}
            onSelect={(c: number) => setStakePerBall(c)}
            size={44}
          />

          {/* Balls stepper + quick multipliers — sits right next to the casino chips */}
          <DockField className="shrink-0 pl-2.5 pr-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
              {mode === "auto" ? "Bets" : "Balls"}
            </span>
            <button
              type="button"
              aria-label="Decrease"
              onClick={() => setBallCount((v) => Math.max(BALLS_MIN, v - 1))}
              disabled={locked}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)] text-[var(--color-ink-muted)] disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={mode === "auto" ? "Bets" : "Balls"}
              value={ballCountInput}
              onChange={(e) => setBallCountInput(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={(e) => commitBallCount(e.target.value || "1")}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={locked}
              className="w-8 bg-transparent text-center font-display text-sm font-bold tabular-nums text-[var(--color-ink)] outline-none"
            />
            <button
              type="button"
              aria-label="Increase"
              onClick={() => setBallCount((v) => Math.min(BALLS_MAX, v + 1))}
              disabled={locked}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)] text-[var(--color-ink-muted)] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--color-surface-border)] pl-2">
              <button
                type="button"
                aria-label="Halve balls"
                onClick={() => setBallCount((v) => Math.max(BALLS_MIN, Math.floor(v / 2)))}
                disabled={locked}
                className="grid h-6 w-7 shrink-0 place-items-center rounded-md bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-ink-muted)] ring-1 ring-[var(--color-surface-border)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                ½
              </button>
              <button
                type="button"
                aria-label="Double balls"
                onClick={() => setBallCount((v) => Math.min(BALLS_MAX, v * 2))}
                disabled={locked}
                className="grid h-6 w-7 shrink-0 place-items-center rounded-md bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-ink-muted)] ring-1 ring-[var(--color-surface-border)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                2×
              </button>
              <button
                type="button"
                aria-label="Max balls"
                onClick={() => setBallCount(BALLS_MAX)}
                disabled={locked}
                className="grid h-6 w-9 shrink-0 place-items-center rounded-md bg-[var(--color-neon)]/15 text-[10px] font-bold text-[var(--color-neon)] ring-1 ring-[var(--color-neon)]/30 transition-colors hover:bg-[var(--color-neon)]/25 disabled:opacity-40"
              >
                Max
              </button>
            </div>
          </DockField>

          <DockReadout
            className="ml-auto"
            label="Stake / ball"
            value={`${fmt(stakePerBall)} pts`}
          />
        </DockRow>

        <DockPrimary onClick={placeBet} disabled={!canDrop} active={canDrop}>
          {pending
            ? "Placing…"
            : busy
              ? `In play · ${activeBalls.length}`
              : `Bet · ${fmt(totalCost)} pts`}
        </DockPrimary>

        {!canAfford && !profile.isLoading && (
          <DockNote>
            Need {fmt(totalCost - balance)} more pts ·{" "}
            <Link to="/wallet" className="underline">
              wallet
            </Link>
          </DockNote>
        )}
      </ControlDock>

    </div>
  );
}



