import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MoveUp, Wallet } from "lucide-react";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { MiniCabinetTitle } from "@/components/arcade/MiniCabinetTitle";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";
import { ArcadeIdleCue } from "@/components/arcade/ArcadeIdleCue";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { ArcadeVerifyCue } from "@/components/arcade/ArcadeVerifyCue";
import { RecentResultsStrip } from "@/components/arcade/RecentResultsStrip";
import { SettlePlaque, useSettleBeat } from "@/components/arcade/SettlePlaque";
import { FairnessPlaque, HudBar, HudPlaque } from "@/components/arcade/ArcadeHud";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,
  DockSeg,
} from "@/components/arcade/ControlDock";
import { TowersBoard } from "@/components/arcade/TowersBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  TOWERS_DIFFICULTIES,
  TOWERS_ROWS,
  towersMultiplierAt,
  type TowersDifficulty,
} from "@/lib/arcade/mini-math";
import {
  cashoutTowers,
  getActiveTowers,
  getMiniConfig,
  getMiniProfile,
  pickTowers,
  startTowers,
} from "@/lib/arcade/mini.functions";

export const Route = createFileRoute("/_authenticated/arcade/towers")({
  head: () => ({
    meta: [
      { title: "Dragon Towers — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Dragon Towers. Climb eight rows, dodge the dragons and bank your multiplier whenever you like.",
      },
      { property: "og:title", content: "Dragon Towers — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Climb the tower, dodge the dragons, bank before one bites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TowersPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `towers_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

const DIFFICULTIES: TowersDifficulty[] = ["easy", "medium", "hard", "nightmare"];

function TowersPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("towers");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const fetchActive = useServerFn(getActiveTowers);
  const startFn = useServerFn(startTowers);
  const pickFn = useServerFn(pickTowers);
  const cashoutFn = useServerFn(cashoutTowers);

  const configQ = useQuery({
    queryKey: ["mini", "towers", "config"],
    queryFn: () => fetchConfig({ data: { product: "towers" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "towers", "profile"],
    queryFn: () => fetchProfile({ data: { product: "towers" } }),
  });
  const activeQ = useQuery({
    queryKey: ["mini", "towers", "active"],
    queryFn: () => fetchActive({}),
    staleTime: 0,
  });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 50));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;
  const todayNet = profileQ.data?.todayNet ?? 0;

  const [stake, setStake] = useState(5);
  const [difficulty, setDifficulty] = useState<TowersDifficulty>("easy");
  const [round, setRound] = useState<any>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(380);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  // Recover an in-flight climb after a refresh.
  useEffect(() => {
    const r = activeQ.data?.round;
    if (r && !round) {
      setRound(r);
      setDifficulty((r.state?.difficulty ?? "easy") as TowersDifficulty);
      setStake(Number(r.stake ?? 5));
    }
  }, [activeQ.data, round]);

  const live = round?.status === "ACTIVE";
  const state = (round?.state ?? {}) as any;
  const picks: number[] = (state.picks ?? []).map((n: any) => Number(n));
  const revealed: number[][] = (state.revealed ?? []).map((row: any) =>
    (row ?? []).map((n: any) => Number(n)),
  );
  const tower: number[][] | null = Array.isArray(state.tower)
    ? state.tower.map((row: any) => (row ?? []).map((n: any) => Number(n)))
    : null;
  const currentRow = Number(round?.stepCount ?? 0);
  const multiplier = live ? Number(state.multiplier ?? 1) : Number(round?.multiplier ?? 0);
  const bustedRow = state.busted_row == null ? null : Number(state.busted_row);

  const nextMultiplier = useMemo(
    () => towersMultiplierAt(difficulty, currentRow + 1),
    [difficulty, currentRow],
  );

  const settle = (r: any, tone: "win" | "loss") => {
    setRound(r);
    if (r.status === "SETTLED") {
      playFor("towers", tone === "win" ? "collect" : "trap");
      runBeat(() => setResultOpen(true));
      qc.invalidateQueries({ queryKey: ["mini", "towers", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    }
  };

  const startMut = useMutation({
    mutationFn: () =>
      startFn({
        data: { stake, difficulty, clientSeed: newSeed(), idempotencyKey: newKey() },
      }),
    onMutate: () => playFor("towers", "spin-start"),
    onSuccess: (res: any) => {
      setRound(res.round);
      setResultOpen(false);
      qc.invalidateQueries({ queryKey: ["mini", "towers", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start that climb."),
  });

  const pickMut = useMutation({
    mutationFn: (tile: number) => pickFn({ data: { roundId: round.id, tile } }),
    onSuccess: (res: any) => {
      const r = res.round;
      if (r.status === "ACTIVE") {
        playFor("towers", "reveal-tick");
        setRound(r);
        return;
      }
      settle(r, r.outcome === "WIN" ? "win" : "loss");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not play that tile."),
  });

  const cashoutMut = useMutation({
    mutationFn: () => cashoutFn({ data: { roundId: round.id } }),
    onSuccess: (res: any) => settle(res.round, "win"),
    onError: (e: any) => toast.error(e?.message ?? "Could not bank that climb."),
  });

  const busy = startMut.isPending || pickMut.isPending || cashoutMut.isPending;
  const canStart =
    !busy && !live && !cfg?.maintenance_mode && balance >= stake && stake >= minStake;
  const won = round?.outcome === "WIN";

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="towers">
        <HudPlaque
          game="towers"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="towers"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="towers" rtpLabel={arcadeFairness("towers").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Dragon Towers is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="towers" />
        <ArcadeStage game="towers" className="relative z-10">
          <ArcadeEntrance game="towers" className="relative">
            <MiniCabinetTitle game="towers" title="Dragon Towers" />
            <SettlePlaque
              game="towers"
              show={beat}
              label={won ? "Banked" : "Dragon"}
              value={won ? `${fmt(Number(round?.multiplier ?? 0))}×` : "—"}
            />
            <TowersBoard
              difficulty={difficulty}
              rows={TOWERS_ROWS}
              currentRow={currentRow}
              picks={picks}
              revealed={revealed}
              tower={tower}
              bustedRow={bustedRow}
              multiplier={multiplier}
              active={Boolean(live)}
              disabled={busy}
              onPick={(tile) => {
                if (!live || busy) return;
                play("button");
                pickMut.mutate(tile);
              }}
            />
            <ArcadeIdleCue game="towers" show={!live && !busy && !resultOpen}>
              Set a stake and climb
            </ArcadeIdleCue>
          </ArcadeEntrance>
        </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="towers"
        empty="No climbs yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "—",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="towers" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="towers"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Climb banked" : "A dragon got you"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={Number(round?.multiplier ?? 0)}
        detail={`${Number(round?.stepCount ?? 0)} of ${TOWERS_ROWS} rows · ${TOWERS_DIFFICULTIES[difficulty].label}`}
      />

      <MiniVerifyDialog
        product="towers"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="towers">
        <DockRow scroll>
          <ChipRack
            game="towers"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy || Boolean(live)}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockReadout
            className="ml-auto"
            label={live ? "Next row" : "Row 1"}
            value={`${fmt(nextMultiplier)}×`}
            hint={`Wins ${fmt(stake * nextMultiplier)}`}
          />
        </DockRow>

        <DockRow>
          <DockSeg
            options={DIFFICULTIES.map((d) => ({
              key: d,
              label: TOWERS_DIFFICULTIES[d].label,
            }))}
            value={difficulty}
            disabled={busy || Boolean(live)}
            onChange={(v) => {
              play("button");
              setDifficulty(v as TowersDifficulty);
            }}
          />
        </DockRow>

        {live ? (
          <DockPrimary
            onClick={() => {
              play("button");
              cashoutMut.mutate();
            }}
            disabled={busy || currentRow === 0}
            active={currentRow > 0}
          >
            {cashoutMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Banking
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" /> Bank · {fmt(stake * multiplier)}
              </>
            )}
          </DockPrimary>
        ) : (
          <DockPrimary
            onClick={() => {
              play("button");
              startMut.mutate();
            }}
            disabled={!canStart}
            active={canStart}
          >
            {startMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Building
              </>
            ) : (
              <>
                <MoveUp className="h-4 w-4" /> Climb · {fmt(stake)}
              </>
            )}
          </DockPrimary>
        )}

        {live && currentRow === 0 ? <DockNote>Clear a row before banking</DockNote> : null}
        {!live && balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
