import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dices, Loader2 } from "lucide-react";
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
import { DiceBoard } from "@/components/arcade/DiceBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  diceMultiplier,
  type DiceDirection,
} from "@/lib/arcade/mini-math";
import { getMiniConfig, getMiniProfile, playDice } from "@/lib/arcade/mini.functions";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/_authenticated/arcade/dice")({
  head: () => ({
    meta: [
      { title: "Dice — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Dice. Pick a target, roll under or over, and every roll is derived from a seed committed before you bet.",
      },
      { property: "og:title", content: "Dice — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Pick your target, roll under or over. Server-decided, verifiable every roll.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DicePage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `dice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function DicePage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("dice");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const rollFn = useServerFn(playDice);

  const configQ = useQuery({
    queryKey: ["mini", "dice", "config"],
    queryFn: () => fetchConfig({ data: { product: "dice" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "dice", "profile"],
    queryFn: () => fetchProfile({ data: { product: "dice" } }),
  });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 500));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;

  const [stake, setStake] = useState(10);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [roll, setRoll] = useState<number | null>(null);
  const [scrambling, setScrambling] = useState(false);
  const [markerProgress, setMarkerProgress] = useState(1);
  const [round, setRound] = useState<any>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(380);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const mult = diceMultiplier(target, direction);

  const rollMut = useMutation({
    mutationFn: () =>
      rollFn({
        data: {
          stake,
          target,
          direction,
          clientSeed: newSeed(),
          idempotencyKey: newKey(),
        },
      }),
    onMutate: () => {
      playFor("dice", "spin-start");
      setRoll(null);
      setScrambling(true);
      setMarkerProgress(0);
    },
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      const value = Number(r?.state?.roll ?? 0);
      // Hold the scramble beat, then land the dial and slide the marker.
      window.setTimeout(() => {
        setScrambling(false);
        setRoll(value);
        playFor("dice", "settle");
        // Marker slide 0 → 1
        const t0 = performance.now();
        const slide = (now: number) => {
          const p = Math.min(1, (now - t0) / 420);
          setMarkerProgress(p);
          if (p < 1) requestAnimationFrame(slide);
          else runBeat(() => setResultOpen(true));
        };
        requestAnimationFrame(slide);
      }, 720);
      qc.invalidateQueries({ queryKey: ["mini", "dice", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => {
      setScrambling(false);
      toast.error(e?.message ?? "Could not place that roll.");
    },
  });

  const busy = rollMut.isPending || scrambling;
  const canRoll = !busy && !cfg?.maintenance_mode && balance >= stake && stake >= minStake;
  const won = round?.outcome === "WIN";
  const todayNet = profileQ.data?.todayNet ?? 0;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="dice">
        <HudPlaque
          game="dice"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="dice"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="dice" rtpLabel={arcadeFairness("dice").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Dice is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="dice" />
        <ArcadeStage game="dice" className="relative z-10">
        <ArcadeEntrance game="dice" className="relative">
          <MiniCabinetTitle game="dice" title="Dice" />
          <SettlePlaque
            game="dice"
            show={beat}
            label={won ? "Roll lands" : "Roll misses"}
            value={won ? `${fmt(Number(round?.multiplier ?? 0))}×` : "—"}
          />
          <DiceBoard
            target={target}
            direction={direction}
            roll={roll}
            rolling={scrambling || rollMut.isPending}
            markerProgress={markerProgress}
          />
          <ArcadeIdleCue game="dice" show={!busy && roll == null && !resultOpen}>
            Set band, then roll
          </ArcadeIdleCue>
        </ArcadeEntrance>
      </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="dice"
        empty="No rolls yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "—",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="dice" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="dice"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Rolled it" : "Missed"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={Number(round?.multiplier ?? 0)}
        detail={`Roll ${Number(round?.state?.roll ?? 0).toFixed(2)} · ${
          direction === "under" ? "under" : "over"
        } ${target.toFixed(2)}`}
      />

      <MiniVerifyDialog
        product="dice"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="dice">
        <DockRow scroll>
          <ChipRack
            game="dice"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockSeg
            options={[
              { key: "under", label: "Under" },
              { key: "over", label: "Over" },
            ]}
            value={direction}
            onChange={(k) => setDirection(k as DiceDirection)}
            disabled={busy}
          />
          <DockReadout
            className="ml-auto"
            label="Pays"
            value={`${mult.toFixed(2)}×`}
            hint={`Wins ${fmt(stake * mult)}`}
          />
        </DockRow>

        <DockRow>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            Target
          </span>
          <Slider
            className="mx-2 min-w-0 flex-1"
            value={[target]}
            min={DICE_MIN_TARGET}
            max={DICE_MAX_TARGET}
            step={1}
            disabled={busy}
            onValueChange={(v) => setTarget(v[0] ?? 50)}
          />
          <span className="w-12 shrink-0 text-right font-display text-sm font-black tabular-nums text-[var(--color-ink)]">
            {target}
          </span>
        </DockRow>

        <DockPrimary onClick={() => { play("button"); rollMut.mutate(); }} disabled={!canRoll} active={canRoll}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Rolling
            </>
          ) : (
            <>
              <Dices className="h-4 w-4" /> Roll · {fmt(stake)}
            </>
          )}
        </DockPrimary>

        {balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
