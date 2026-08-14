import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Shuffle, Target } from "lucide-react";
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
import { KenoBoard } from "@/components/arcade/KenoBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  KENO_MAX_PICKS,
  KENO_POOL,
  kenoMaxMultiplier,
  type KenoRisk,
} from "@/lib/arcade/mini-math";
import { getMiniConfig, getMiniProfile, playKeno } from "@/lib/arcade/mini.functions";

export const Route = createFileRoute("/_authenticated/arcade/keno")({
  head: () => ({
    meta: [
      { title: "Keno — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Keno. Mark up to ten numbers on a forty-ball board and watch ten balls drawn from a pre-committed seed.",
      },
      { property: "og:title", content: "Keno — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Mark your numbers, watch the draw. Server-decided and verifiable every ticket.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KenoPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `keno_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function KenoPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("keno");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const playFn = useServerFn(playKeno);

  const configQ = useQuery({
    queryKey: ["mini", "keno", "config"],
    queryFn: () => fetchConfig({ data: { product: "keno" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "keno", "profile"],
    queryFn: () => fetchProfile({ data: { product: "keno" } }),
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
  const [risk, setRisk] = useState<KenoRisk>("classic");
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [round, setRound] = useState<any>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(380);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const topMultiplier = useMemo(
    () => (picks.length ? kenoMaxMultiplier(risk, picks.length) : 0),
    [risk, picks.length],
  );

  const toggle = (n: number) => {
    setPicks((prev) => {
      if (prev.includes(n)) return prev.filter((p) => p !== n);
      if (prev.length >= KENO_MAX_PICKS) return prev;
      play("button");
      return [...prev, n];
    });
  };

  const quickPick = () => {
    play("button");
    const count = picks.length || 5;
    const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    setPicks(pool.slice(0, count).sort((a, b) => a - b));
    setDrawn([]);
    setRevealed(0);
  };

  const playMut = useMutation({
    mutationFn: () =>
      playFn({
        data: {
          stake,
          risk,
          picks,
          clientSeed: newSeed(),
          idempotencyKey: newKey(),
        },
      }),
    onMutate: () => {
      playFor("keno", "spin-start");
      setDrawn([]);
      setRevealed(0);
    },
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      const balls: number[] = (r?.state?.drawn ?? []).map((n: any) => Number(n));
      setDrawn(balls);
      // Reveal the draw one ball at a time so the ticket resolves on screen.
      balls.forEach((_, i) => {
        window.setTimeout(() => {
          setRevealed(i + 1);
          playFor("keno", "reveal-tick");
          if (i === balls.length - 1) {
            playFor("keno", "settle");
            runBeat(() => setResultOpen(true));
          }
        }, 160 * (i + 1));
      });
      qc.invalidateQueries({ queryKey: ["mini", "keno", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => {
      setDrawn([]);
      setRevealed(0);
      toast.error(e?.message ?? "Could not place that ticket.");
    },
  });

  const drawing = drawn.length > 0 && revealed < drawn.length;
  const busy = playMut.isPending || drawing;
  const canPlay =
    !busy && !cfg?.maintenance_mode && picks.length > 0 && balance >= stake && stake >= minStake;
  const won = round?.outcome === "WIN";
  const todayNet = profileQ.data?.todayNet ?? 0;
  const settledMultiplier = drawing ? null : round ? Number(round.multiplier ?? 0) : null;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="keno">
        <HudPlaque
          game="keno"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="keno"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="keno" rtpLabel={arcadeFairness("keno").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Keno is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="keno" />
        <ArcadeStage game="keno" className="relative z-10">
          <ArcadeEntrance game="keno" className="relative">
            <MiniCabinetTitle game="keno" title="Keno" />
            <SettlePlaque
              game="keno"
              show={beat}
              label={won ? "Ticket pays" : "No pay"}
              value={won ? `${fmt(Number(round?.multiplier ?? 0))}×` : "—"}
            />
            <KenoBoard
              picks={picks}
              drawn={drawn}
              revealed={revealed}
              risk={risk}
              onToggle={toggle}
              disabled={busy}
              multiplier={settledMultiplier}
            />
            <ArcadeIdleCue game="keno" show={!busy && picks.length === 0 && !resultOpen}>
              Mark up to 10 numbers
            </ArcadeIdleCue>
          </ArcadeEntrance>
        </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="keno"
        empty="No tickets yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "—",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="keno" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="keno"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Ticket pays" : "No hits worth paying"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={Number(round?.multiplier ?? 0)}
        detail={`${Number(round?.state?.hits ?? 0)} of ${picks.length} marked · ${risk}`}
      />

      <MiniVerifyDialog
        product="keno"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="keno">
        <DockRow scroll>
          <ChipRack
            game="keno"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockSeg
            options={[
              { key: "classic", label: "Classic" },
              { key: "medium", label: "Medium" },
              { key: "high", label: "High" },
            ]}
            value={risk}
            onChange={(k) => setRisk(k as KenoRisk)}
            disabled={busy}
          />
          <DockReadout
            className="ml-auto"
            label="Top pay"
            value={topMultiplier ? `${fmt(topMultiplier)}×` : "—"}
            hint={topMultiplier ? `Wins ${fmt(stake * topMultiplier)}` : "Mark numbers"}
          />
        </DockRow>

        <DockRow>
          <button
            type="button"
            onClick={quickPick}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] disabled:opacity-50"
          >
            <Shuffle className="h-3.5 w-3.5" /> Quick pick
          </button>
          <button
            type="button"
            onClick={() => {
              setPicks([]);
              setDrawn([]);
              setRevealed(0);
            }}
            disabled={busy || picks.length === 0}
            className="ml-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] disabled:opacity-50"
          >
            Clear
          </button>
          <span className="ml-auto font-display text-sm font-black tabular-nums text-[var(--color-ink)]">
            {picks.length}/{KENO_MAX_PICKS}
          </span>
        </DockRow>

        <DockPrimary
          onClick={() => {
            play("button");
            playMut.mutate();
          }}
          disabled={!canPlay}
          active={canPlay}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Drawing
            </>
          ) : (
            <>
              <Target className="h-4 w-4" /> Play · {fmt(stake)}
            </>
          )}
        </DockPrimary>

        {picks.length === 0 ? <DockNote>Mark at least one number</DockNote> : null}
        {balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
