import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins, Loader2, Play } from "lucide-react";
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
} from "@/components/arcade/ControlDock";
import { HiloBoard, type HiloCard } from "@/components/arcade/HiloBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import type { HiloGuess } from "@/lib/arcade/mini-math";
import {
  cashoutHilo,
  getActiveHilo,
  getMiniConfig,
  getMiniProfile,
  guessHilo,
  startHilo,
} from "@/lib/arcade/mini.functions";

export const Route = createFileRoute("/_authenticated/arcade/hilo")({
  head: () => ({
    meta: [
      { title: "Hi-Lo — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Hi-Lo. Call the next card higher or lower, compound your multiplier and collect before you miss.",
      },
      { property: "og:title", content: "Hi-Lo — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Call higher or lower, compound the multiplier, bank it before you miss.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HiloPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `hilo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function HiloPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("hilo");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const startFn = useServerFn(startHilo);
  const guessFn = useServerFn(guessHilo);
  const cashoutFn = useServerFn(cashoutHilo);
  const activeFn = useServerFn(getActiveHilo);

  const configQ = useQuery({
    queryKey: ["mini", "hilo", "config"],
    queryFn: () => fetchConfig({ data: { product: "hilo" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "hilo", "profile"],
    queryFn: () => fetchProfile({ data: { product: "hilo" } }),
  });
  const activeQ = useQuery({ queryKey: ["mini", "hilo", "active"], queryFn: () => activeFn() });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 250));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;

  const [stake, setStake] = useState(10);
  const [round, setRound] = useState<any>(null);
  const [pending, setPending] = useState<HiloGuess | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [settled, setSettled] = useState<any>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(340);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  // Recover an in-flight run after a refresh.
  useEffect(() => {
    const r = activeQ.data?.round;
    if (r && !round) {
      setRound(r);
      setStake(Number(r.stake ?? 10));
    }
  }, [activeQ.data, round]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mini", "hilo", "profile"] });
    qc.invalidateQueries({ queryKey: ["mini", "hilo", "active"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  const cards: HiloCard[] = ((round?.state?.cards ?? []) as any[]).map((c) => ({
    rank: Number(c.rank),
    suit: Number(c.suit),
  }));
  const live = round?.status === "ACTIVE";
  const multiplier = Number(round?.state?.multiplier ?? 1);
  const runStake = Number(round?.stake ?? stake);

  /** The card that ended a lost run, so the board can show the miss. */
  const lostCard =
    round && round.status === "SETTLED" && round.outcome === "LOSS" && cards.length > 1
      ? cards[cards.length - 1]
      : null;
  const boardCards = lostCard ? cards.slice(0, -1) : cards;

  const startMut = useMutation({
    mutationFn: () =>
      startFn({ data: { stake, clientSeed: newSeed(), idempotencyKey: newKey() } }),
    onSuccess: (res: any) => {
      setRound(res.round);
      setSettled(null);
      playFor("hilo", "reveal-tick");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start that run."),
  });

  const guessMut = useMutation({
    mutationFn: (g: HiloGuess) => guessFn({ data: { roundId: round.id, guess: g } }),
    onMutate: (g: HiloGuess) => setPending(g),
    onSettled: () => setPending(null),
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      if (r.status === "SETTLED") {
        setSettled(r);
        playFor("hilo", r.outcome === "WIN" ? "collect" : "loss");
        runBeat(() => setResultOpen(true));
      } else {
        playFor("hilo", "step");
      }
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not call that card."),
  });

  const cashMut = useMutation({
    mutationFn: () => cashoutFn({ data: { roundId: round.id } }),
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      setSettled(r);
      playFor("hilo", "collect");
      runBeat(() => setResultOpen(true));
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not collect."),
  });

  const busy = startMut.isPending || guessMut.isPending || cashMut.isPending;
  const canStart = !busy && !live && balance >= stake && stake >= minStake && !cfg?.maintenance_mode;
  const canCollect = live && !busy && Number(round?.stepCount ?? 0) > 0;
  const todayNet = profileQ.data?.todayNet ?? 0;
  const won = settled?.outcome === "WIN";

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="hilo">
        <HudPlaque
          game="hilo"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="hilo"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="hilo" rtpLabel={arcadeFairness("hilo").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Hi-Lo is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="hilo" />
        <ArcadeStage game="hilo" className="relative z-10">
        <ArcadeEntrance game="hilo" className="relative">
          <MiniCabinetTitle game="hilo" title="Hi-Lo" />
          <SettlePlaque
            game="hilo"
            show={beat}
            label={
              won
                ? settled?.state?.collected
                  ? "Run banked"
                  : "Called right"
                : "Called wrong"
            }
            value={won ? `${fmt(Number(settled?.multiplier ?? 0))}×` : "—"}
          />
          <HiloBoard
            cards={boardCards}
            multiplier={multiplier}
            stake={runStake}
            canGuess={Boolean(live) && !busy}
            pendingGuess={pending}
            onGuess={(g) => guessMut.mutate(g)}
            lostCard={lostCard}
            stepCount={Number(round?.stepCount ?? 0)}
          />
          <ArcadeIdleCue game="hilo" show={!live && !busy && !resultOpen}>
            Deal, then call
          </ArcadeIdleCue>
        </ArcadeEntrance>
      </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="hilo"
        empty="No runs yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "L",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="hilo" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="hilo"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Collected" : "Called it wrong"}
        net={Number(settled?.userNet ?? 0)}
        stake={Number(settled?.stake ?? runStake)}
        ratio={Number(settled?.multiplier ?? 0)}
        detail={
          won
            ? `Banked ${fmt(Number(settled?.grossReturn ?? 0))} pts at ${fmt(
                Number(settled?.multiplier ?? 0),
              )}× after ${settled?.stepCount ?? 0} calls.`
            : `The run ended after ${settled?.stepCount ?? 0} correct calls.`
        }
      />

      <MiniVerifyDialog
        product="hilo"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="hilo">
        <DockRow scroll>
          <ChipRack
            game="hilo"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy || Boolean(live)}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockReadout
            className="ml-auto"
            label={live ? "At risk" : "Stake"}
            value={`${fmt(runStake)} pts`}
            hint={live ? `Worth ${fmt(runStake * multiplier)}` : undefined}
          />
        </DockRow>

        <DockPrimary
          onClick={() => {
            play("button");
            if (canCollect) cashMut.mutate();
            else if (canStart) startMut.mutate();
          }}
          disabled={!canStart && !canCollect}
          active={canStart || canCollect}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Working
            </>
          ) : canCollect ? (
            <>
              <HandCoins className="h-4 w-4" /> Bank {fmt(runStake * multiplier)}
            </>
          ) : live ? (
            "Call on the felt"
          ) : (
            <>
              <Play className="h-4 w-4" /> Deal · {fmt(stake)}
            </>
          )}
        </DockPrimary>

        {!live && balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
