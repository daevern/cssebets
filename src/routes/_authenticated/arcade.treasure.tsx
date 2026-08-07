import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TreasureGrid } from "@/components/arcade/TreasureGrid";
import { ChipRack } from "@/components/arcade/ChipRack";
import { TreasureVerifyDialog } from "@/components/arcade/TreasureVerifyDialog";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import {
  collectTreasureRound,
  getActiveTreasureRound,
  getTreasureConfig,
  getTreasureProfile,
  revealTreasureTile,
  startTreasureRound,
} from "@/lib/arcade/treasure.functions";

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
  const clientSeed = useRef(newSeed());

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
      if (res.tileType === "TRAP") {
        setTraps(res.traps ?? null);
        setResultRound(res.round);
        // Let the bomb blast/shake animation finish before the modal covers it.
        window.setTimeout(() => setResultOpen(true), 900);
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
      setRound(res.round);
      setTraps(res.traps ?? null);
      setResultRound(res.round);
      setResultOpen(true);
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
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Balance" value={`${fmt(balance)}`} />
        <Stat
          label="Multiplier"
          value={`${currentMult.toFixed(2)}×`}
          accent={safeReveals > 0}
        />
        <Stat label="Found" value={`${safeReveals}`} />
      </div>

      <div className="relative">
        <TreasureGrid
          rows={Number(config?.grid_rows ?? 5)}
          cols={Number(config?.grid_cols ?? 5)}
          opened={opened}
          traps={traps}
          pendingIndex={pendingTile}
          disabled={!active || busy}
          onReveal={onReveal}
        />
        {!active && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)]/85 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] backdrop-blur">
              {settled
                ? round.status === "WON"
                  ? "Collected"
                  : "Busted"
                : "Set your stake to begin"}
            </span>
          </div>
        )}
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
                  ? "bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                  : next
                    ? "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                    : "bg-[var(--color-surface-2)]/50 text-[var(--color-ink-muted)]",
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

      {settled && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => setVerifyId(round.id)}
            className="rounded-lg border border-[var(--color-neon)]/50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]"
          >
            Verify round
          </button>
        </div>
      )}

      {resultRound && (
        <ArcadeResultDialog
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
          detail={
            <>
              {resultRound.status === "WON"
                ? `Cashed out ${fmt(Number(resultRound.gross_return ?? 0))} pts at ${Number(resultRound.current_multiplier ?? 1).toFixed(2)}× · ${resultRound.safe_reveals} safe tiles`
                : `Trap hit after ${resultRound.safe_reveals} safe ${resultRound.safe_reveals === 1 ? "tile" : "tiles"} · staked ${fmt(Number(resultRound.stake ?? 0))} pts`}
            </>
          }
          footer={
            <button
              type="button"
              onClick={() => {
                setResultOpen(false);
                setVerifyId(resultRound.id);
              }}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[var(--color-surface-border)] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]"
            >
              <ShieldCheck className="h-3 w-3" /> Verify
            </button>
          }
        />
      )}

      <TreasureVerifyDialog
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        roundId={verifyId}
      />

      {/* Sticky console */}
      <ControlDock>
        {!active ? (
          <>
            <DockSeg
              grow
              value={difficulty}
              onChange={(d: string) => setDifficulty(d as Difficulty)}
              options={(["easy", "medium", "hard"] as Difficulty[]).map((d) => ({
                key: d,
                label: `${d} · ${configs.find((x: any) => x.difficulty === d)?.trap_count ?? "-"}`,
              }))}
            />

            <DockRow scroll>
              <ChipRack
                values={chips}
                max={maxStake}
                value={stake}
                onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
                size={44}
              />
              <DockReadout className="ml-auto" label="Stake" value={`${fmt(stake)} pts`} />
            </DockRow>

            <DockPrimary
              onClick={() => (settled ? newRound() : startM.mutate())}
              disabled={!settled && !canStart}
              loading={startM.isPending}
            >
              {settled ? "New round" : `Play · ${fmt(stake)} pts`}
            </DockPrimary>
          </>
        ) : (
          <DockRow>
            <DockReadout
              align="left"
              label="Next tile"
              value={nextMult ? `${nextMult.toFixed(2)}×` : "—"}
            />
            <DockReadout align="left" label="Collect" value={`${fmt(collectable)} pts`} />
            <DockPrimary
              className="ml-auto flex-1"
              onClick={() => collectM.mutate()}
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

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[4px] bg-[var(--color-surface-2)] px-2.5 py-1.5">
      <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-sm font-bold tabular-nums",
          accent ? "text-[var(--color-neon)]" : "text-[var(--color-ink)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
