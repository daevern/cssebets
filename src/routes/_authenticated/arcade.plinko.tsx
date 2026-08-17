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
import { Minus, Plus } from "lucide-react";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockField,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,
  DockSeg,


} from "@/components/arcade/ControlDock";
import { cn } from "@/lib/utils";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { SettlePlaque, useSettleBeat } from "@/components/arcade/SettlePlaque";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound, winSfxForRatio } from "@/lib/arcade/sound";
import { getArcadePersonalBest } from "@/lib/arcade/personal-best.functions";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";
import { ArcadeIdleCue } from "@/components/arcade/ArcadeIdleCue";
import { MiniCabinetTitle } from "@/components/arcade/MiniCabinetTitle";

import * as React from "react";
import { FairnessPlaque, HudBar, HudPlaque } from "@/components/arcade/ArcadeHud";
import { ArcadeVerifyCue } from "@/components/arcade/ArcadeVerifyCue";
import { FlatCosmeticsStrip } from "@/components/arcade/FlatCosmeticsStrip";
import { RecentResultsStrip } from "@/components/arcade/RecentResultsStrip";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import type { ConfigVersion, PlinkoRisk, PlinkoRows } from "@/lib/arcade/config-registry";

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
  const { play, playFor } = useArcadeSound("plinko");
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
  const { beat, run: runBeat } = useSettleBeat(340);
  const [plaqueMult, setPlaqueMult] = useState<number | null>(null);
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
      // Short on-board plaque so the payout lands on the table, not only in the HUD.
      setPlaqueMult(m);
      runBeat(() => setPlaqueMult(null));
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
      <HudBar game="plinko">
        <Stat className="flex-1" label="Balance" value={<AnimatedBalance value={balance} />} />
        <Stat
          className="flex-1"
          label="Max win"
          value={`${maxMult.toFixed(maxMult >= 100 ? 0 : 1)}×`}
        />
        <Stat
          className="flex-1"
          label="Last"
          value={
            lastGame && !busy
              ? `${Number(lastGame.multiplier ?? 0).toFixed(2)}×`
              : busy
                ? "In play"
                : "—"
          }
        />
        <FairnessPlaque
          game="plinko"
          rtpLabel={
            arcadeFairness("plinko", {
              version: (currentProfile?.version === 1 ? 1 : 2) as ConfigVersion,
              rows: rows as PlinkoRows,
              risk: riskMode as PlinkoRisk,
            }).rtpLabel
          }
          tag="Fair"
        />
      </HudBar>

      {/* Colour spill lives OUTSIDE the stage: ArcadeStage clips its children. */}
      <div className="relative isolate">
        <ArcadeGlow game="plinko" />
        <ArcadeStage game="plinko" className="relative z-10">
          <ArcadeEntrance game="plinko" className="relative">
            <MiniCabinetTitle game="plinko" title="Plinko" />
            <SettlePlaque
              game="plinko"
              show={beat && plaqueMult != null}
              label={(plaqueMult ?? 0) >= 1 ? "Payout" : "Landed"}
              value={`${Number(plaqueMult ?? 0).toFixed(2)}×`}
            />
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
            />
            <ArcadeIdleCue game="plinko" show={activeBalls.length === 0 && !lastGame && !pending}>
              Pick a chip, then drop
            </ArcadeIdleCue>
          </ArcadeEntrance>
        </ArcadeStage>
      </div>


      <RecentResultsStrip
        game="plinko"
        empty="No drops yet"
        items={recent.slice(0, 12).map((m, i) => ({
          key: `${i}-${m}`,
          label: `${m.toFixed(m >= 100 ? 0 : 2)}×`,
          tone: m >= 5 ? "hot" : m >= 1 ? "win" : "loss",
        }))}
        trailing={
          lastGame && !busy ? (
            <ArcadeVerifyCue game="plinko" onClick={() => setVerifyOpen(true)} />
          ) : null
        }
      />




      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} gameId={lastGame?.id ?? null} />

      <ControlDock game="plinko">
        <FlatCosmeticsStrip disabled={locked} />

        <DockRow scroll>
          <DockSeg
            options={RISK_OPTIONS.map((r) => ({ key: r.key, label: r.label }))}
            value={riskMode}
            onChange={(k) => setRiskMode(k as RiskMode)}
            disabled={locked}
          />
          <DockSeg
            options={[
              { key: "manual", label: "Manual" },
              { key: "auto", label: "Auto" },
            ]}
            value={mode}
            onChange={(k) => setMode(k as BetMode)}
            disabled={locked}
          />
          <DockSeg
            className="ml-auto"
            options={ROW_OPTIONS.map((r) => ({ key: String(r), label: String(r) }))}
            value={String(rows)}
            onChange={(k) => setRows(Number(k) as RowsCount)}
            disabled={locked}
          />
        </DockRow>



        <DockRow scroll>
          <ChipRack
            game="plinko"
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
            hint={`Max ${fmt(stakePerBall * maxMult)} if top slot`}
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



