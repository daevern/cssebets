import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCw } from "lucide-react";
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
import { WheelBoard } from "@/components/arcade/WheelBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import { wheelMaxMultiplier, type WheelRisk } from "@/lib/arcade/mini-math";
import { getMiniConfig, getMiniProfile, playWheel } from "@/lib/arcade/mini.functions";

export const Route = createFileRoute("/_authenticated/arcade/wheel")({
  head: () => ({
    meta: [
      { title: "Fortune Wheel — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Fortune Wheel. Twenty equal segments, three risk tables, and a winning segment committed before the wheel moves.",
      },
      { property: "og:title", content: "Fortune Wheel — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Pick your risk table and spin. The landing segment is committed before you spin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WheelPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `wheel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function WheelPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("wheel");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const spinFn = useServerFn(playWheel);

  const configQ = useQuery({
    queryKey: ["mini", "wheel", "config"],
    queryFn: () => fetchConfig({ data: { product: "wheel" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "wheel", "profile"],
    queryFn: () => fetchProfile({ data: { product: "wheel" } }),
  });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 250));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;

  const [stake, setStake] = useState(10);
  const [risk, setRisk] = useState<WheelRisk>("medium");
  const [round, setRound] = useState<any>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(340);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const spinMut = useMutation({
    mutationFn: () =>
      spinFn({ data: { stake, risk, clientSeed: newSeed(), idempotencyKey: newKey() } }),
    onMutate: () => {
      setSpinning(true);
      playFor("wheel", "spin-start");
    },
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      setLanded(Number(r?.state?.segment ?? 0));
      setSpinKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["mini", "wheel", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => {
      setSpinning(false);
      toast.error(e?.message ?? "Could not spin.");
    },
  });

  /** Fires when the wheel physically stops on the server-decided segment. */
  const onSettled = () => {
    setSpinning(false);
    playFor("wheel", "settle");
    runBeat(() => setResultOpen(true));
  };

  const busy = spinMut.isPending || spinning;
  const canSpin = !busy && balance >= stake && stake >= minStake && !cfg?.maintenance_mode;
  const mult = Number(round?.multiplier ?? 0);
  const won = round?.outcome === "WIN";
  const todayNet = profileQ.data?.todayNet ?? 0;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="wheel">
        <HudPlaque
          game="wheel"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="wheel"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <HudPlaque
          game="wheel"
          className="flex-1"
          label="Spins today"
          value={`${profileQ.data?.todayRounds ?? 0}`}
        />
        <HudPlaque
          game="wheel"
          className="flex-1"
          label="Best hit"
          value={`${fmt(profileQ.data?.bestMultiplier ?? 0)}×`}
        />
        <FairnessPlaque game="wheel" rtpLabel={arcadeFairness("wheel").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Fortune Wheel is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="wheel" />
        <ArcadeStage game="wheel" className="relative z-10">
        <ArcadeEntrance game="wheel" className="relative">
          <MiniCabinetTitle game="wheel" title="Fortune Wheel" kicker="Risk · spin · land" />
          <SettlePlaque
            game="wheel"
            show={beat}
            label={won ? "Paid" : "No win"}
            value={`${fmt(mult)}×`}
          />
          <WheelBoard risk={risk} landedIndex={landed} spinKey={spinKey} onSettled={onSettled} />
          <ArcadeIdleCue game="wheel" show={!busy && landed == null && !resultOpen}>
            Pick a risk table, then spin
          </ArcadeIdleCue>
        </ArcadeEntrance>
      </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="wheel"
        empty="No spins yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: `${fmt(r.multiplier)}×`,
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="wheel" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="wheel"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Landed it" : "Cold segment"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={mult}
        detail={`The pointer stopped on ${fmt(mult)}× on the ${risk} table.`}
      />

      <MiniVerifyDialog
        product="wheel"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="wheel">
        <DockRow scroll>
          <ChipRack
            game="wheel"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockSeg
            options={[
              { key: "low", label: "Low" },
              { key: "medium", label: "Med" },
              { key: "high", label: "High" },
            ]}
            value={risk}
            onChange={(k) => setRisk(k as WheelRisk)}
            disabled={busy}
          />
          <DockReadout
            className="ml-auto"
            label="Top prize"
            value={`${fmt(wheelMaxMultiplier(risk))}×`}
            hint={`Max ${fmt(stake * wheelMaxMultiplier(risk))}`}
          />
        </DockRow>

        <DockPrimary
          onClick={() => {
            play("button");
            spinMut.mutate();
          }}
          disabled={!canSpin}
          active={canSpin}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Spinning
            </>
          ) : (
            <>
              <RotateCw className="h-4 w-4" /> Spin {fmt(stake)} pts
            </>
          )}
        </DockPrimary>

        {balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
