import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { MiniCabinetTitle } from "@/components/arcade/MiniCabinetTitle";
import { TreasureGrid } from "@/components/arcade/TreasureGrid";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,
} from "@/components/arcade/ControlDock";
import { TreasureVerifyDialog } from "@/components/arcade/TreasureVerifyDialog";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";
import { ArcadeIdleCue } from "@/components/arcade/ArcadeIdleCue";
import { SettlePlaque, useSettleBeat } from "@/components/arcade/SettlePlaque";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { getArcadePersonalBest } from "@/lib/arcade/personal-best.functions";
import { FairnessPlaque, HudBar, HudPlaque } from "@/components/arcade/ArcadeHud";
import { RecentResultsStrip } from "@/components/arcade/RecentResultsStrip";
import { ArcadeVerifyCue } from "@/components/arcade/ArcadeVerifyCue";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  collectTreasureRound,
  getActiveTreasureRound,
  getTreasureConfig,
  getTreasureProfile,
  revealTreasureTile,
  startTreasureRound,
} from "@/lib/arcade/treasure.functions";

import * as React from "react";

/** Engraved cabinet plaque bound to this game's theme. */
const Stat = (props: Omit<React.ComponentProps<typeof HudPlaque>, "game">) => (
  <HudPlaque game="treasure" {...props} />
);


export const Route = createFileRoute("/_authenticated/arcade/treasure")({
  head: () => ({
    meta: [
      { title: "Treasure Grid — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Uncover treasure tiles, dodge the traps and collect before you bust. Virtual points only, provably fair.",
      },
      { property: "og:title", content: "Treasure Grid — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Provably fair 5x5 treasure hunt played with virtual arcade points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TreasurePage,
});

type Difficulty = "easy" | "medium" | "hard";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 14);

function TreasurePage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("treasure");
  const fetchBest = useServerFn(getArcadePersonalBest);
  const bestQ = useQuery({
    queryKey: ["treasure", "personal-best"],
    queryFn: () => fetchBest({ data: { game: "treasure" } }),
  });
  const fetchConfig = useServerFn(getTreasureConfig);
  const fetchProfile = useServerFn(getTreasureProfile);
  const fetchActive = useServerFn(getActiveTreasureRound);
  const startFn = useServerFn(startTreasureRound);
  const revealFn = useServerFn(revealTreasureTile);
  const collectFn = useServerFn(collectTreasureRound);

  const configQ = useQuery({ queryKey: ["treasure", "config"], queryFn: () => fetchConfig() });
  const profileQ = useQuery({ queryKey: ["treasure", "profile"], queryFn: () => fetchProfile() });
  const activeQ = useQuery({ queryKey: ["treasure", "active"], queryFn: () => fetchActive() });

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [stake, setStake] = useState(10);
  const [opened, setOpened] = useState<Record<number, "SAFE" | "TRAP">>({});
  const [traps, setTraps] = useState<number[] | null>(null);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [round, setRound] = useState<any>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultRound, setResultRound] = useState<any>(null);
  const { beat, run: runBeat } = useSettleBeat(340);
  const clientSeed = useRef(newSeed());
  const [recent, setRecent] = useState<
    Array<{ key: string; label: string; tone?: "hot" | "win" | "neutral" | "loss" }>
  >([]);

  const pushRecent = (r: any) => {
    if (!r?.id) return;
    const won = r.status === "WON";
    const mult = Number(r.current_multiplier ?? 1);
    setRecent((prev) =>
      [
        {
          key: String(r.id),
          label: won ? `${mult.toFixed(mult >= 10 ? 1 : 2)}×` : "X",
          tone: won ? (mult >= 5 ? ("hot" as const) : ("win" as const)) : ("loss" as const),
        },
        ...prev.filter((x) => x.key !== String(r.id)),
      ].slice(0, 12),
    );
  };

  // hydrate an in-flight round after refresh
  useEffect(() => {
    const d = activeQ.data;
    if (!d?.round || round) return;
    setRound(d.round);
    setDifficulty(d.round.difficulty);
    setStake(Number(d.round.stake));
    setOpened(
      Object.fromEntries(d.revealed.map((r) => [r.tile_index, r.tile_type as "SAFE" | "TRAP"])),
    );
  }, [activeQ.data, round]);

  const configs = configQ.data?.configs ?? [];
  const config = useMemo(
    () => configs.find((c: any) => c.difficulty === difficulty),
    [configs, difficulty],
  );
  const multipliers = useMemo(
    () =>
      (configQ.data?.multipliers ?? [])
        .filter((m: any) => m.config_id === config?.id)
        .sort((a: any, b: any) => a.safe_reveals - b.safe_reveals),
    [configQ.data, config],
  );

  const balance = profileQ.data?.balance ?? 0;
  const active = round && ["CREATED", "ACTIVE", "COLLECTING"].includes(round.status);
  const safeReveals = round?.safe_reveals ?? 0;
  const currentMult = Number(round?.current_multiplier ?? 1);
  const nextMult = Number(
    multipliers.find((m: any) => m.safe_reveals === safeReveals + 1)?.actual_multiplier ?? 0,
  );
  const collectable = active && safeReveals > 0 ? Math.floor(Number(round.stake) * currentMult) : 0;

  const chips: number[] = (config?.chip_values as number[]) ?? [1, 5, 10, 25, 50, 100];
  const minStake = Number(config?.min_stake ?? 1);
  const maxStake = Number(config?.max_stake ?? 100);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["treasure", "profile"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  const startM = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          difficulty,
          stake,
          clientSeed: clientSeed.current,
          idempotencyKey: newKey(),
        },
      }),
    onSuccess: (res) => {
      play("chip");
      setOpened({});
      setTraps(null);
      setRound(res.round);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revealM = useMutation({
    mutationFn: (tile: number) =>
      revealFn({
        data: {
          roundId: round.id,
          tileIndex: tile,
          stateVersion: round.state_version,
          idempotencyKey: newKey(),
        },
      }),
    onSuccess: (res) => {
      setOpened((o) => ({ ...o, [res.tileIndex]: res.tileType }));
      setRound(res.round);
      setPendingTile(null);
      if (res.tileType === "SAFE") {
        // Crystalline chime, pitch climbing with the streak.
        const found = Number(res.round?.safe_reveals ?? 1);
        playFor("treasure", "reveal-tick", { rate: Math.min(1.8, 1 + found * 0.07) });
      }
      if (res.tileType === "TRAP") {
        // Synced with the bomb blast/shake keyframes on the tile.
        playFor("treasure", "trap");
        setTraps(res.traps ?? null);
        setResultRound(res.round);
        pushRecent(res.round);
        // Let the bomb blast/shake animation finish before the modal covers it.
        window.setTimeout(() => runBeat(() => setResultOpen(true)), 900);
        refresh();
      }
    },
    onError: (e: Error) => {
      setPendingTile(null);
      toast.error(e.message);
      activeQ.refetch();
    },
  });

  const collectM = useMutation({
    mutationFn: () =>
      collectFn({
        data: { roundId: round.id, stateVersion: round.state_version, idempotencyKey: newKey() },
      }),
    onSuccess: (res) => {
      play("collect");
      setRound(res.round);
      setTraps(res.traps ?? null);
      setResultRound(res.round);
      pushRecent(res.round);
      // Vault-unlock beat on the board before the themed dialog.
      runBeat(() => setResultOpen(true));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onReveal = (tile: number) => {
    if (!active || revealM.isPending || collectM.isPending) return;
    setPendingTile(tile);
    revealM.mutate(tile);
  };

  const newRound = () => {
    setRound(null);
    setOpened({});
    setTraps(null);
    clientSeed.current = newSeed();
    qc.invalidateQueries({ queryKey: ["treasure", "active"] });
  };

  const busy = startM.isPending || revealM.isPending || collectM.isPending;
  const canStart = !active && stake >= minStake && stake <= maxStake && stake <= balance && !busy;
  const settled = round && !active;

  if (configQ.isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-neon)]" />
      </div>
    );
  }

  if (config?.maintenance_mode) {
    return (
      <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-6 text-center text-xs uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        Treasure Grid is under maintenance
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 md:gap-3">
      <HudBar game="treasure">
        <Stat className="flex-1" label="Balance" value={<AnimatedBalance value={balance} />} />
        <Stat
          className="flex-1"
          label="Multiplier"
          value={`${currentMult.toFixed(2)}×`}
          accent={safeReveals > 0}
        />
        <FairnessPlaque
          game="treasure"
          rtpLabel={arcadeFairness("treasure").rtpLabel}
          tag="Fair"
        />
      </HudBar>

      <div className="relative isolate">
      <ArcadeGlow game="treasure" />
      <ArcadeStage game="treasure" className="relative z-10">
      <ArcadeEntrance game="treasure">
      <MiniCabinetTitle game="treasure" title="Treasure Grid" />
      <div className="relative">
        <SettlePlaque
          game="treasure"
          show={beat}
          label={resultRound?.status === "WON" ? "Vault unlocked" : "Vault sealed"}
          value={
            resultRound?.status === "WON"
              ? `${Number(resultRound?.current_multiplier ?? 1).toFixed(2)}×`
              : "Trap"
          }
        />
        <TreasureGrid
          rows={Number(config?.grid_rows ?? 5)}
          cols={Number(config?.grid_cols ?? 5)}
          opened={opened}
          traps={traps}
          pendingIndex={pendingTile}
          disabled={!active || busy}
          difficulty={difficulty}
          onDifficultyChange={(d) => setDifficulty(d as Difficulty)}
          difficultyOptions={configs.map((c: any) => ({
            key: c.difficulty,
            label: `${c.difficulty} · ${c.trap_count ?? "-"}`,
          }))}
          onReveal={onReveal}
          message={
            active
              ? null
              : settled
                ? round.status === "WON"
                  ? "Collected"
                  : "Busted"
                : null
          }
        />
        <ArcadeIdleCue game="treasure" show={!active && !busy && !resultOpen}>
          {settled ? "New round when ready" : "Pick difficulty · Stake · Dig"}
        </ArcadeIdleCue>
      </div>


      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {multipliers.slice(0, 14).map((m: any) => {
          const reached = safeReveals >= m.safe_reveals;
          const next = safeReveals + 1 === m.safe_reveals;
          return (
            <div
              key={m.safe_reveals}
              className={cn(
                "shrink-0 rounded-[4px] px-2.5 py-1 text-center",
                reached
                  ? "bg-[#00e701]/15 text-[#00e701]"
                  : next
                    ? "bg-[#0f212e] text-white"
                    : "bg-[#0f212e]/60 text-white/45",
              )}
            >
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] opacity-70">
                {m.safe_reveals}
              </div>
              <div className="font-display text-[11px] font-bold tabular-nums">
                {Number(m.actual_multiplier).toFixed(2)}×
              </div>
            </div>
          );
        })}
      </div>

      </ArcadeEntrance>
      </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="treasure"
        empty="No digs yet"
        items={recent}
        trailing={
          settled ? (
            <ArcadeVerifyCue game="treasure" onClick={() => setVerifyId(round.id)} />
          ) : null
        }
      />

      {resultRound && (
        <ArcadeResultDialog
          game="treasure"
          open={resultOpen}
          onOpenChange={setResultOpen}
          tone={
            Number(resultRound.user_net ?? 0) > 0
              ? "win"
              : Number(resultRound.user_net ?? 0) < 0
                ? "loss"
                : "push"
          }
          headline={
            resultRound.status === "WON"
              ? "You collected"
              : Number(resultRound.user_net ?? 0) === 0
                ? "Stake returned"
                : "Busted"
          }
          net={Number(resultRound.user_net ?? 0)}
          stake={Number(resultRound.stake ?? 0)}
          detail={
            <>
              {resultRound.status === "WON"
                ? `Cashed out ${fmt(Number(resultRound.gross_return ?? 0))} pts at ${Number(resultRound.current_multiplier ?? 1).toFixed(2)}× · ${resultRound.safe_reveals} safe tiles`
                : `Trap hit after ${resultRound.safe_reveals} safe ${resultRound.safe_reveals === 1 ? "tile" : "tiles"} · staked ${fmt(Number(resultRound.stake ?? 0))} pts`}
            </>
          }
          footer={
            <ArcadeVerifyCue
              game="treasure"
              className="h-9 px-4 text-[10px]"
              onClick={() => {
                setResultOpen(false);
                setVerifyId(resultRound.id);
              }}
            />
          }
        />
      )}

      <TreasureVerifyDialog
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        roundId={verifyId}
      />

      {/* Sticky console */}
      <ControlDock game="treasure">
        {!active ? (
          <>
            <DockRow scroll>
              <ChipRack
                game="treasure"
                values={chips}
                max={maxStake}
                value={stake}
                onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
                size={44}
              />
              <DockReadout
                className="ml-auto"
                label="Stake"
                value={`${fmt(stake)} pts`}
                hint={nextMult ? `First safe → ${nextMult.toFixed(2)}×` : undefined}
              />
            </DockRow>

            <DockPrimary
              onClick={() => {
                play("button");
                if (settled) newRound();
                else startM.mutate();
              }}
              disabled={!settled && !canStart}
              loading={startM.isPending}
            >
              {settled ? "New round" : `Play · ${fmt(stake)} pts`}
            </DockPrimary>

            {balance < stake && !settled && (
              <DockNote>
                Need {fmt(stake - balance)} more pts ·{" "}
                <Link to="/wallet" className="underline">
                  wallet
                </Link>
              </DockNote>
            )}
          </>
        ) : (
          <DockRow>
            <DockReadout
              align="left"
              label="Next tile"
              value={nextMult ? `${nextMult.toFixed(2)}×` : "—"}
              hint={nextMult ? `Pays ~${fmt(Math.floor(stake * nextMult))} if safe` : undefined}
            />
            <DockReadout align="left" label="Collect" value={`${fmt(collectable)} pts`} />
            <DockPrimary
              className="ml-auto flex-1"
              onClick={() => {
                play("button");
                collectM.mutate();
              }}
              disabled={safeReveals === 0 || busy}
              loading={collectM.isPending}
            >
              Collect
            </DockPrimary>
          </DockRow>
        )}
      </ControlDock>

    </div>
  );
}

