import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins, Loader2, Rocket } from "lucide-react";
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
import { CrashBoard } from "@/components/arcade/CrashBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import {
  CRASH_CAP,
  CRASH_GROWTH_PER_SECOND,
  CRASH_MIN_CASHOUT,
  crashMultiplierAt,
} from "@/lib/arcade/mini-math";
import {
  cashoutCrash,
  getActiveCrash,
  getMiniConfig,
  getMiniProfile,
  startCrash,
} from "@/lib/arcade/mini.functions";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/_authenticated/arcade/crash")({
  head: () => ({
    meta: [
      { title: "Crash — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Crash. A multiplier climbs from 1.00× — bank it before the run busts. Every bust point is committed before you launch.",
      },
      { property: "og:title", content: "Crash — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Ride the curve, cash out before it busts. Server-decided and verifiable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
    ],
  }),
  component: CrashPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `crash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function CrashPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("crash");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const fetchActive = useServerFn(getActiveCrash);
  const startFn = useServerFn(startCrash);
  const cashFn = useServerFn(cashoutCrash);

  const configQ = useQuery({
    queryKey: ["mini", "crash", "config"],
    queryFn: () => fetchConfig({ data: { product: "crash" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "crash", "profile"],
    queryFn: () => fetchProfile({ data: { product: "crash" } }),
  });
  const activeQ = useQuery({
    queryKey: ["mini", "crash", "active"],
    queryFn: () => fetchActive(),
  });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 500));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;
  const growth = Number(cfg?.params?.growth_per_second ?? CRASH_GROWTH_PER_SECOND);

  const [stake, setStake] = useState(10);
  const [autoOn, setAutoOn] = useState(false);
  const [autoTarget, setAutoTarget] = useState(2);
  const [round, setRound] = useState<any>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(380);
  const autoFired = useRef(false);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  // Recover a run left in flight by a refresh or a dropped connection.
  useEffect(() => {
    const recovered = activeQ.data?.round;
    if (recovered && !round) setRound(recovered);
  }, [activeQ.data, round]);

  const active = round?.status === "ACTIVE";
  const startedAt: string | null = round?.createdAt ?? round?.created_at ?? null;
  const settledMultiplier = round && !active ? Number(round.multiplier ?? 0) : null;
  const crashedAt =
    round && !active ? Number(round.state?.crash_point ?? round.state?.crashPoint ?? 0) : null;
  const cashedAt = round && !active && Number(round.multiplier ?? 0) > 0 ? settledMultiplier : null;

  const settle = (r: any, silent?: boolean) => {
    setRound(r);
    const win = r?.outcome === "WIN";
    playFor("crash", win ? "collect" : "settle");
    if (!silent) runBeat(() => setResultOpen(true));
    qc.invalidateQueries({ queryKey: ["mini", "crash", "profile"] });
    qc.invalidateQueries({ queryKey: ["mini", "crash", "active"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  const startMut = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          stake,
          autoCashout: autoOn ? autoTarget : null,
          clientSeed: newSeed(),
          idempotencyKey: newKey(),
        },
      }),
    onMutate: () => {
      autoFired.current = false;
      setRound(null);
      playFor("crash", "spin-start");
    },
    onSuccess: (res: any) => {
      const r = res.round;
      setRound(r);
      if (r?.status !== "ACTIVE") settle(r);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not launch that run."),
  });

  const cashMut = useMutation({
    mutationFn: (roundId: string) => cashFn({ data: { roundId } }),
    onSuccess: (res: any) => settle(res.round),
    onError: (e: any) => {
      toast.error(e?.message ?? "That run had already busted.");
      qc.invalidateQueries({ queryKey: ["mini", "crash", "active"] });
    },
  });

  // Watch the curve: fire the auto cash-out, and settle the moment it busts.
  useEffect(() => {
    if (!active || !startedAt) return;
    const id = window.setInterval(() => {
      const seconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
      const m = crashMultiplierAt(Math.max(0, seconds), growth);
      if (autoOn && !autoFired.current && m >= autoTarget && !cashMut.isPending) {
        autoFired.current = true;
        cashMut.mutate(round.id);
        return;
      }
      // Past the cap the server has certainly resolved the run — pull the result.
      if (m >= CRASH_CAP && !cashMut.isPending) {
        qc.invalidateQueries({ queryKey: ["mini", "crash", "active"] });
      }
    }, 120);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startedAt, growth, autoOn, autoTarget, round?.id]);

  // Poll the server while a run is live so a bust resolves without a click.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      fetchActive()
        .then((res: any) => {
          if (!res?.round && round?.id) {
            // The sweep settled it — refresh history and show the outcome.
            profileQ.refetch().then((p: any) => {
              const latest = p.data?.recent?.[0];
              if (latest?.id === round.id) settle(latest);
              else setRound(null);
            });
          }
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, round?.id]);

  const won = round?.outcome === "WIN";
  const todayNet = profileQ.data?.todayNet ?? 0;
  const canLaunch =
    !active && !startMut.isPending && !cfg?.maintenance_mode && balance >= stake && stake >= minStake;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="crash">
        <HudPlaque
          game="crash"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="crash"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="crash" rtpLabel={arcadeFairness("crash").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Crash is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="crash" />
        <ArcadeStage game="crash" className="relative z-10">
          <ArcadeEntrance game="crash" className="relative">
            <MiniCabinetTitle game="crash" title="Crash" />
            <SettlePlaque
              game="crash"
              show={beat}
              label={won ? "Banked" : "Busted"}
              value={won ? `${fmt(Number(round?.multiplier ?? 0))}×` : "—"}
            />
            <CrashBoard
              startedAt={startedAt}
              running={Boolean(active)}
              crashedAt={crashedAt}
              cashedAt={cashedAt}
              autoCashout={autoOn ? autoTarget : null}
              growth={growth}
            />
            <ArcadeIdleCue game="crash" show={!active && !startMut.isPending && !resultOpen}>
              Set your stake, then launch
            </ArcadeIdleCue>
          </ArcadeEntrance>
        </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="crash"
        empty="No runs yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "—",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="crash" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="crash"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Banked in time" : "Busted"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={Number(round?.multiplier ?? 0)}
        detail={
          crashedAt ? `Run busted at ${fmt(crashedAt)}×` : `Banked at ${fmt(cashedAt ?? 0)}×`
        }
      />

      <MiniVerifyDialog
        product="crash"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <ControlDock game="crash">
        <DockRow scroll>
          <ChipRack
            game="crash"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={Boolean(active)}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockReadout
            className="ml-auto"
            label="Auto"
            value={autoOn ? `${autoTarget.toFixed(2)}×` : "off"}
            hint={autoOn ? `Wins ${fmt(stake * autoTarget)}` : "Manual cash-out"}
          />
        </DockRow>

        <DockRow>
          <button
            type="button"
            onClick={() => {
              play("button");
              setAutoOn((v) => !v);
            }}
            disabled={Boolean(active)}
            className="shrink-0 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)] disabled:opacity-50"
          >
            {autoOn ? "Auto on" : "Auto off"}
          </button>
          <Slider
            className="mx-2 min-w-0 flex-1"
            value={[autoTarget]}
            min={CRASH_MIN_CASHOUT}
            max={20}
            step={0.05}
            disabled={Boolean(active) || !autoOn}
            onValueChange={(v) => setAutoTarget(v[0] ?? 2)}
          />
          <span className="w-14 shrink-0 text-right font-display text-sm font-black tabular-nums text-[var(--color-ink)]">
            {autoTarget.toFixed(2)}×
          </span>
        </DockRow>

        {active ? (
          <DockPrimary
            onClick={() => {
              play("button");
              cashMut.mutate(round.id);
            }}
            disabled={cashMut.isPending}
            active
          >
            {cashMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Banking
              </>
            ) : (
              <>
                <HandCoins className="h-4 w-4" /> Cash out
              </>
            )}
          </DockPrimary>
        ) : (
          <DockPrimary
            onClick={() => {
              play("button");
              startMut.mutate();
            }}
            disabled={!canLaunch}
            active={canLaunch}
          >
            {startMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Launching
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Launch · {fmt(stake)}
              </>
            )}
          </DockPrimary>
        )}

        {balance < stake && !active ? (
          <DockNote>Not enough points for this stake</DockNote>
        ) : null}
      </ControlDock>
    </div>
  );
}
