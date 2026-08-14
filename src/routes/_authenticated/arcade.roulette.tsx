import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Trash2, Undo2, X } from "lucide-react";
import {
  getRouletteConfig,
  getRouletteProfile,
  placeRouletteSpin,
} from "@/lib/arcade/roulette.functions";
import { getRouletteSession } from "@/lib/arcade/roulette-phase2.functions";
import { RouletteVerifyDialog } from "@/components/arcade/RouletteVerifyDialog";
import { RouletteWheel } from "@/components/arcade/RouletteWheel";
import { rouletteBallAudio } from "@/lib/arcade/roulette-ball-audio";
import { RouletteBoard } from "@/components/arcade/RouletteBoard";
import { ChipRack } from "@/components/arcade/ChipRack";
import { ControlDock, DockIconButton, DockNote, DockPrimary, DockRow } from "@/components/arcade/ControlDock";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import {
  positionKey,
  returnMultiplier,
  pocketColour,
  type BetPosition,
  type BetTypeKey,
} from "@/lib/arcade/roulette-math";
import { cn } from "@/lib/utils";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { ArcadeGlow } from "@/components/arcade/ArcadeGlow";
import { MiniCabinetTitle } from "@/components/arcade/MiniCabinetTitle";
import { FairnessPlaque, HudBar, HudPlaque } from "@/components/arcade/ArcadeHud";
import { RecentResultsStrip } from "@/components/arcade/RecentResultsStrip";
import { ArcadeVerifyCue } from "@/components/arcade/ArcadeVerifyCue";
import { ArcadeIdleCue } from "@/components/arcade/ArcadeIdleCue";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import { useArcadeSound } from "@/lib/arcade/sound";
import { getArcadePersonalBest } from "@/lib/arcade/personal-best.functions";
import { ArcadeEntrance } from "@/components/arcade/ArcadeEntrance";
import { SettlePlaque, useSettleBeat } from "@/components/arcade/SettlePlaque";
import { ARCADE_THEMES } from "@/lib/arcade/theme";

export const Route = createFileRoute("/_authenticated/arcade/roulette")({
  head: () => ({
    meta: [
      { title: "Roulette — cssebets Arcade" },
      {
        name: "description",
        content:
          "European 37-pocket roulette played with virtual arcade points. Provably fair, every pocket equally likely.",
      },
      { property: "og:title", content: "Roulette — cssebets Arcade" },
      {
        property: "og:description",
        content: "37 equally likely pockets, provably fair spins, virtual points only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoulettePage,
});

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt = (n: number) => nf.format(n);

function randHex(bytes = 12) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function RoulettePage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("roulette");
  const bestFn = useServerFn(getArcadePersonalBest);
  const bestQ = useQuery({
    queryKey: ["roulette", "personal-best"],
    queryFn: () => bestFn({ data: { game: "roulette" } }),
  });
  const configFn = useServerFn(getRouletteConfig);
  const profileFn = useServerFn(getRouletteProfile);
  const spinFn = useServerFn(placeRouletteSpin);
  const sessionFn = useServerFn(getRouletteSession);

  const config = useQuery({ queryKey: ["roulette-config"], queryFn: () => configFn({}) });
  const profile = useQuery({
    queryKey: ["roulette-profile"],
    queryFn: () => profileFn({}),
    refetchOnWindowFocus: true,
  });
  const session = useQuery({
    queryKey: ["roulette-session"],
    queryFn: () => sessionFn({}),
    refetchOnWindowFocus: true,
  });

  const cfg = config.data?.config as any;
  const chips: number[] = cfg?.chip_values ?? [1, 5, 10, 25, 50, 100];
  const maxPositions: number = cfg?.max_positions ?? 20;
  const maxPerPosition: number = cfg?.max_stake_per_position ?? 250;
  const minTotal: number = cfg?.min_total_stake ?? 1;
  const maxTotal: number = cfg?.max_total_stake ?? 1000;

  const [chip, setChip] = useState<number>(10);
  const [positions, setPositions] = useState<BetPosition[]>([]);
  const [history, setHistory] = useState<BetPosition[][]>([]);
  const [lastConfirmed, setLastConfirmed] = useState<BetPosition[]>([]);
  const [clientSeed] = useState(() => randHex(12));
  const [result, setResult] = useState<any | null>(null);
  const [spinToken, setSpinToken] = useState<string | null>(null);
  const [settled, setSettled] = useState(true);
  const { beat, run: runBeat } = useSettleBeat(340);
  const [slipOpen, setSlipOpen] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (session.data) setCooldown(session.data.cooldownRemaining);
  }, [session.data]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (chips.length && !chips.includes(chip)) setChip(chips[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data]);

  const balance = profile.data?.balance ?? 0;
  const totalStake = useMemo(
    () => Math.round(positions.reduce((a, p) => a + p.stake, 0) * 100) / 100,
    [positions],
  );
  const potentialTotal = useMemo(() => {
    let best = 0;
    for (let n = 0; n <= 36; n++) {
      const g = positions.reduce(
        (a, p) => a + (p.pockets.includes(n) ? p.stake * returnMultiplier(p.pockets.length) : 0),
        0,
      );
      best = Math.max(best, g);
    }
    return Math.round(best * 100) / 100;
  }, [positions]);

  const stakesByKey = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of positions) m[positionKey(p.bet_type, p.pockets)] = p.stake;
    return m;
  }, [positions]);

  const spinning = !settled;
  const cooldownSeconds = Number(session.data?.cooldownSeconds ?? cfg?.cooldown_seconds ?? 0);
  const dailyLimit = Number(session.data?.dailySpinLimit ?? cfg?.daily_spin_limit ?? 0);
  const spinsToday = Number(session.data?.spinsToday ?? 0);
  const dailyLimitReached = dailyLimit > 0 && spinsToday >= dailyLimit;

  const canSpin =
    !spinning &&
    cooldown <= 0 &&
    !dailyLimitReached &&
    positions.length > 0 &&
    totalStake >= minTotal &&
    totalStake <= maxTotal &&
    balance >= totalStake &&
    !cfg?.maintenance_mode;

  const pushHistory = () => setHistory((h) => [...h.slice(-24), positions]);

  const place = (betType: BetTypeKey, label: string, pockets: number[]) => {
    if (spinning) return;
    const key = positionKey(betType, pockets);
    const existing = positions.find((p) => positionKey(p.bet_type, p.pockets) === key);
    if (!existing && positions.length >= maxPositions) {
      toast.error(`Maximum ${maxPositions} bet positions.`);
      return;
    }
    const nextStake = (existing?.stake ?? 0) + chip;
    if (nextStake > maxPerPosition) {
      toast.error(`Max ${maxPerPosition} pts per position.`);
      return;
    }
    if (totalStake + chip > balance) {
      toast.error("Not enough points.");
      return;
    }
    play("chip");
    pushHistory();
    setPositions((prev) =>
      existing
        ? prev.map((p) =>
            positionKey(p.bet_type, p.pockets) === key ? { ...p, stake: nextStake } : p,
          )
        : [...prev, { id: key, bet_type: betType, label, pockets, stake: chip }],
    );
  };

  const removeOne = (key: string) => {
    pushHistory();
    setPositions((prev) =>
      prev
        .map((p) =>
          positionKey(p.bet_type, p.pockets) === key ? { ...p, stake: p.stake - chip } : p,
        )
        .filter((p) => p.stake > 0),
    );
  };

  const clearAll = () => {
    if (spinning) return;
    pushHistory();
    setPositions([]);
  };

  const undo = () => {
    if (spinning || !history.length) return;
    setPositions(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const doubleBets = () => {
    if (spinning) return;
    if (totalStake * 2 > balance) return;
    if (positions.some((p) => p.stake * 2 > maxPerPosition)) {
      toast.error(`Max ${maxPerPosition} pts per position.`);
      return;
    }
    pushHistory();
    setPositions((prev) => prev.map((p) => ({ ...p, stake: p.stake * 2 })));
  };

  const repeat = () => {
    if (spinning || !lastConfirmed.length) return;
    pushHistory();
    setPositions(lastConfirmed.map((p) => ({ ...p })));
    toast.info("Previous bets loaded — press Spin to play.");
  };

  const mutation = useMutation({
    mutationFn: async () =>
      spinFn({
        data: {
          bets: positions.map((p) => ({
            bet_type: p.bet_type,
            label: p.label,
            pockets: p.pockets,
            stake: p.stake,
          })),
          clientSeed,
          idempotencyKey: randHex(16),
        },
      }),
    onSuccess: (res: any) => {
      setResult(res);
      setSpinToken(res.spin.id);
      setSettled(false);
      setLastConfirmed(positions.map((p) => ({ ...p })));
    },
    onError: (e: any) => {
      setSettled(true);
      toast.error(e?.message ?? "Spin failed");
    },
  });

  const spin = () => {
    play("button");
    if (!canSpin) return;
    playFor("roulette", "spin-start");
    rouletteBallAudio.start();
    setResult(null);
    setSettled(false);
    setSlipOpen(false);
    mutation.mutate();
  };

  const onSettled = () => {
    setSettled(true);
    // Wooden click as the ball drops into its pocket.
    rouletteBallAudio.settle();
    playFor("roulette", "settle");
    qc.invalidateQueries({ queryKey: ["roulette-profile"] });
    qc.invalidateQueries({ queryKey: ["roulette-session"] });
    qc.invalidateQueries({ queryKey: ["roulette-stats"] });
    if (cooldownSeconds > 0) setCooldown(cooldownSeconds);
    const spinRow = result?.spin;
    if (!spinRow) return;
    // Short on-table pocket plaque before the themed result dialog.
    runBeat(() => setResultOpen(true));
  };

  // Never leave the rolling bed running if the player leaves mid-spin.
  useEffect(() => () => rouletteBallAudio.stop(), []);

  const winningPocket = result?.spin ? Number(result.spin.winning_pocket) : null;

  if (config.isLoading) {
    return <div className="p-6 text-[11px] text-[var(--color-ink-muted)]">Loading roulette…</div>;
  }
  if (config.isError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-[12px] text-[var(--color-ink)]">
        Roulette is unavailable right now. Please try again shortly.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cfg?.announcement && (
        <div className="rounded-xl border border-[var(--color-neon)]/30 bg-[var(--color-neon)]/8 px-3 py-2 text-[11px] text-[var(--color-ink)]">
          {cfg.announcement}
        </div>
      )}

      <HudBar game="roulette">
        <HudPlaque
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          className="flex-1"
          label="Today"
          value={`${(profile.data?.todayNet ?? 0) >= 0 ? "+" : ""}${fmt(profile.data?.todayNet ?? 0)}`}
          tone={
            (profile.data?.todayNet ?? 0) > 0
              ? "up"
              : (profile.data?.todayNet ?? 0) < 0
                ? "down"
                : undefined
          }
        />
        <FairnessPlaque
          game="roulette"
          rtpLabel={arcadeFairness("roulette").rtpLabel}
          tag="Fair"
        />
      </HudBar>


      {cooldownSeconds > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          <span className={cn("ml-auto", cooldown > 0 && "text-[var(--color-neon)]")}>
            {cooldown > 0 ? `Cooldown ${cooldown}s` : "Ready to spin"}
          </span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-border)]">
            <span
              className="block h-full rounded-full bg-[var(--color-neon)] transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(0, 100 - (cooldown / cooldownSeconds) * 100)}%` }}
            />
          </span>
        </div>
      )}

      {/* Curved casino table: felt head arcs around the wheel, betting layout flows out of it */}
      <div className="relative isolate">
      <ArcadeGlow game="roulette" className="-top-8 -bottom-8" />
      <div
        className="relative z-10 border"
        style={{
          background: ARCADE_THEMES.roulette.feltOrBoardFill,
          borderColor: ARCADE_THEMES.roulette.hud.plaqueBorder,
          borderWidth: 1,
          borderRadius: "12px",
        }}
      >
        <SettlePlaque
          game="roulette"
          show={beat && winningPocket != null}
          label="Pocket"
          value={`${winningPocket} · ${winningPocket == null ? "" : pocketColour(winningPocket)}`}
        />
        {/* felt head */}
        <div className="relative px-3 pt-3 pb-2">
          <MiniCabinetTitle game="roulette" title="Roulette" />
          <ArcadeEntrance game="roulette" className="mx-auto w-full max-w-[280px]">
            <div
              className="relative rounded-full border p-2"
              style={{
                background: "#0f212e",
                borderColor: "rgba(255,255,255,.08)",
              }}
            >
              <RouletteWheel
                winningPocket={winningPocket}
                spinToken={spinToken}
                spinning={spinning}
                reducedMotion={reduced}
                onSettled={onSettled}
                onFrame={({ speed, onTrack }) =>
                  // Continuous rolling bed synthesised from the ball's real
                  // on-screen velocity — pitch and brightness fall with it.
                  rouletteBallAudio.setVelocity(speed, onTrack)
                }
                onHop={({ energy }) => {
                  // Each real fret collision gets its own clack, scaled to that
                  // bounce's actual energy — heavy first hop lands loud and low,
                  // the last, smallest hop is a light, high tick right before it
                  // settles. This is the rhythm a real ball makes; a single
                  // spin-then-click clip can't reproduce it.
                  rouletteBallAudio.hop(energy);
                  playFor("roulette", "bounce", {
                    volume: 0.35 + energy * 0.85,
                    rate: 1.55 - energy * 0.45,
                  });
                }}
              />
              <ArcadeIdleCue
                game="roulette"
                show={!spinning && !mutation.isPending && positions.length === 0}
                className="bottom-1"
              >
                Place chips on the layout
              </ArcadeIdleCue>
            </div>
          </ArcadeEntrance>

          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="text-[8px] font-bold uppercase leading-4 tracking-[0.2em] text-white/70">
              {winningPocket == null ? (
                <span>{positions.length ? "Ready to spin" : "Place chips, then spin"}</span>
              ) : (
                <span
                  className={cn(
                    pocketColour(winningPocket) === "red"
                      ? "text-[#ff9aa4]"
                      : pocketColour(winningPocket) === "green"
                        ? "text-[var(--color-neon)]"
                        : "text-white",
                  )}
                >
                  {pocketColour(winningPocket)}
                  {winningPocket !== 0 && (
                    <>
                      {" · "}
                      {winningPocket % 2 === 0 ? "Even" : "Odd"}
                      {" · "}
                      {winningPocket <= 18 ? "Low" : "High"}
                    </>
                  )}
                </span>
              )}
            </div>
          </div>

          <RecentResultsStrip
            game="roulette"
            empty="No spins yet"
            className="mt-1 border-white/15 bg-black/25"
            items={(profile.data?.recent ?? []).slice(0, 12).map((r: any) => ({
              key: String(r.id),
              label: String(r.winning_pocket),
              tone:
                r.winning_colour === "green"
                  ? "hot"
                  : r.winning_colour === "red"
                    ? "win"
                    : "neutral",
            }))}
            trailing={
              result?.spin ? (
                <ArcadeVerifyCue
                  game="roulette"
                  onClick={() => setVerifyId(result.spin.id)}
                />
              ) : null
            }
          />
        </div>

        {/* betting layout, sharing the same felt */}
        <div className="px-2 pb-2 lg:overflow-x-auto [scrollbar-width:thin]">
          <div className="lg:min-w-[560px]">
            <RouletteBoard stakes={stakesByKey} onPlace={place} disabled={spinning} bare />
          </div>
        </div>
      </div>
      </div>

      



      {result?.spin && (
        <ArcadeResultDialog
          game="roulette"
          open={resultOpen && settled}
          onOpenChange={setResultOpen}
          tone={
            Number(result.spin.user_net) > 0
              ? "win"
              : Number(result.spin.user_net) === 0
                ? "push"
                : "loss"
          }
          headline={
            Number(result.spin.user_net) > 0
              ? "You win"
              : Number(result.spin.user_net) === 0
                ? "Stake returned"
                : "No win this spin"
          }
          net={Number(result.spin.user_net ?? 0)}
          stake={Number(result.spin.total_stake ?? 0)}
          detail={
            <>
              Pocket {result.spin.winning_pocket} (
              {pocketColour(Number(result.spin.winning_pocket))}) · staked{" "}
              {fmt(Number(result.spin.total_stake))} · returned{" "}
              {fmt(Number(result.spin.total_return))}
              <div className="mt-1 font-mono text-[9px] opacity-70">
                #{result.spin.verification_id}
              </div>
            </>
          }
          footer={
            <ArcadeVerifyCue
              game="roulette"
              className="h-9 px-4 text-[10px]"
              onClick={() => {
                setResultOpen(false);
                setVerifyId(result.spin.id);
              }}
            />
          }
        />
      )}




      <RouletteVerifyDialog
        open={!!verifyId}
        onOpenChange={(v) => !v && setVerifyId(null)}
        spinId={verifyId}
      />

      {/* Sticky bet slip + spin */}
      <ControlDock game="roulette">
        {slipOpen && positions.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2">
            {positions.map((p) => {
              const key = positionKey(p.bet_type, p.pockets);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 text-[11px] text-[var(--color-ink)]"
                >
                  <span className="truncate">{p.label}</span>
                  <span className="ml-auto shrink-0 font-display font-bold tabular-nums text-[var(--color-neon)]">
                    {fmt(p.stake)}
                  </span>
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    ×{returnMultiplier(p.pockets.length).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeOne(key)}
                    disabled={spinning}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--color-surface-border)] text-[var(--color-ink-muted)] disabled:opacity-40"
                    aria-label={`Remove ${chip} from ${p.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <DockRow scroll>
          <ChipRack
            game="roulette" values={chips} value={chip} onSelect={(c) => setChip(c)} size={44} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DockIconButton onClick={undo} disabled={spinning || !history.length} title="Undo">
              <Undo2 className="h-4 w-4" />
            </DockIconButton>
            <DockIconButton
              onClick={clearAll}
              disabled={spinning || !positions.length}
              title="Clear all"
            >
              <Trash2 className="h-4 w-4" />
            </DockIconButton>
            <DockIconButton
              onClick={repeat}
              disabled={spinning || !lastConfirmed.length}
              title="Repeat bets"
            >
              <RotateCcw className="h-4 w-4" />
            </DockIconButton>
            <DockIconButton
              onClick={doubleBets}
              disabled={spinning || !positions.length || totalStake * 2 > balance}
              title="Double bets"
              className="font-mono text-[12px] font-black text-[var(--color-neon)]"
            >
              2×
            </DockIconButton>
          </div>
        </DockRow>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
          <button
            type="button"
            onClick={() => setSlipOpen((v) => !v)}
            disabled={!positions.length}
            className="font-bold text-[var(--color-neon)] disabled:opacity-40"
          >
            {positions.length} {positions.length === 1 ? "position" : "positions"}
          </button>
          <span className="ml-auto">
            Stake{" "}
            <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
              {fmt(totalStake)}
            </span>
          </span>
          <span>
            Max return{" "}
            <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
              {fmt(potentialTotal)}
            </span>
          </span>
        </div>

        <DockPrimary onClick={spin} disabled={!canSpin} active={canSpin}>
          {mutation.isPending
            ? "Placing…"
            : spinning
              ? "Spinning…"
              : cooldown > 0
                ? `Cooldown ${cooldown}s`
                : dailyLimitReached
                  ? "Daily limit reached"
                  : `Spin · ${fmt(totalStake)} pts`}
        </DockPrimary>

        {balance < totalStake && (
          <DockNote>
            Need {fmt(totalStake - balance)} more pts ·{" "}
            <Link to="/wallet" className="underline">
              wallet
            </Link>
          </DockNote>
        )}
      </ControlDock>

    </div>
  );
}




