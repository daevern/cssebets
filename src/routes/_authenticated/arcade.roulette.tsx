import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import {
  getRouletteConfig,
  getRouletteProfile,
  placeRouletteSpin,
} from "@/lib/arcade/roulette.functions";
import { getRouletteSession } from "@/lib/arcade/roulette-phase2.functions";
import { RouletteVerifyDialog } from "@/components/arcade/RouletteVerifyDialog";
import { RouletteWheel } from "@/components/arcade/RouletteWheel";
import { RouletteBoard } from "@/components/arcade/RouletteBoard";
import { CasinoChip } from "@/components/arcade/CasinoChip";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import {
  positionKey,
  returnMultiplier,
  pocketColour,
  THEORETICAL_HOUSE_EDGE,
  type BetPosition,
  type BetTypeKey,
} from "@/lib/arcade/roulette-math";
import { Corner } from "@/components/ui/page-shell";
import { cn } from "@/lib/utils";

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
    if (!canSpin) return;
    setResult(null);
    setSettled(false);
    setSlipOpen(false);
    mutation.mutate();
  };

  const onSettled = () => {
    setSettled(true);
    qc.invalidateQueries({ queryKey: ["roulette-profile"] });
    qc.invalidateQueries({ queryKey: ["roulette-session"] });
    qc.invalidateQueries({ queryKey: ["roulette-stats"] });
    if (cooldownSeconds > 0) setCooldown(cooldownSeconds);
    const spinRow = result?.spin;
    if (!spinRow) return;
    setResultOpen(true);
  };

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
    <div className="space-y-3">
      {cfg?.announcement && (
        <div className="rounded-xl border border-[var(--color-neon)]/30 bg-[var(--color-neon)]/8 px-3 py-2 text-[11px] text-[var(--color-ink)]">
          {cfg.announcement}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Balance" value={`${fmt(balance)}`} accent />
        <Stat
          label="Today"
          value={`${(profile.data?.todayNet ?? 0) >= 0 ? "+" : ""}${fmt(profile.data?.todayNet ?? 0)}`}
        />
        <Stat
          label="W / L"
          value={`${profile.data?.totalWins ?? 0} / ${profile.data?.totalLosses ?? 0}`}
        />
      </div>

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

      <div className="relative p-0">
        <Corner pos="tr" />
        <div className="absolute right-2 top-2 z-10 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/90 px-2 py-1 text-right">
          <div className="text-[7px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            House edge
          </div>
          <div className="font-display text-[11px] font-bold tabular-nums text-[var(--color-ink)]">
            {(THEORETICAL_HOUSE_EDGE * 100).toFixed(2)}%
          </div>
        </div>

        <RouletteWheel
          winningPocket={winningPocket}
          spinToken={spinToken}
          spinning={spinning}
          reducedMotion={reduced}
          onSettled={onSettled}
        />
        <div className="mt-2 flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(profile.data?.recent ?? []).map((r: any) => (
            <span
              key={r.id}
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                r.winning_colour === "green"
                  ? "bg-[var(--color-neon)] text-black"
                  : r.winning_colour === "red"
                    ? "bg-[#e0374a] text-white"
                    : "bg-[#161c22] text-[var(--color-ink)] ring-1 ring-[var(--color-surface-border)]",
              )}
            >
              {r.winning_pocket}
            </span>
          ))}
          {!(profile.data?.recent ?? []).length && (
            <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              No spins yet
            </span>
          )}
        </div>
      </div>

      {result?.spin && (
        <ArcadeResultDialog
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
            <button
              type="button"
              onClick={() => {
                setResultOpen(false);
                setVerifyId(result.spin.id);
              }}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[var(--color-surface-border)] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]"
            >
              <ShieldCheck className="h-3 w-3" /> Verify
            </button>
          }
        />
      )}


      <RouletteBoard stakes={stakesByKey} onPlace={place} disabled={spinning} />

      <RouletteVerifyDialog
        open={!!verifyId}
        onOpenChange={(v) => !v && setVerifyId(null)}
        spinId={verifyId}
      />

      {/* Sticky bet slip + spin */}
      <div data-arcade-console className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 pb-[calc(64px+env(safe-area-inset-bottom))] backdrop-blur md:pb-0">
        <div className="mx-auto w-full max-w-4xl space-y-2 px-3 py-2">
          {slipOpen && positions.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2">
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
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                      ×{returnMultiplier(p.pockets.length).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOne(key)}
                      disabled={spinning}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[var(--color-surface-border)] text-[var(--color-ink-muted)] disabled:opacity-40"
                      aria-label={`Remove ${chip} from ${p.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible px-1 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <CasinoChip key={c} value={c} selected={chip === c} onClick={() => setChip(c)} size={44} />
          ))}
          <div className="ml-auto flex shrink-0 gap-1">
            <IconBtn onClick={undo} disabled={spinning || !history.length} title="Undo">
              <Undo2 className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={clearAll} disabled={spinning || !positions.length} title="Clear all">
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={repeat} disabled={spinning || !lastConfirmed.length} title="Repeat bets">
              <RotateCcw className="h-3.5 w-3.5" />
            </IconBtn>
            <button
              type="button"
              onClick={doubleBets}
              disabled={spinning || !positions.length || totalStake * 2 > balance}
              className="grid h-9 w-9 place-items-center rounded-[4px] bg-[var(--color-surface-2)] font-mono text-[11px] font-black text-[var(--color-neon)] transition-colors hover:bg-[var(--color-surface-2)]/70 disabled:opacity-35"
            >
              2×
            </button>
          </div>
        </div>


          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
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

          <button
            type="button"
            onClick={spin}
            disabled={!canSpin}
            className={cn(
              "flex h-11 w-full items-center justify-center rounded-full font-display text-xs font-bold uppercase tracking-[0.2em] transition-all",
              canSpin
                ? "bg-[var(--color-neon)] text-black active:opacity-90"
                : "border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]",
            )}
          >
            {mutation.isPending
              ? "Placing…"
              : spinning
                ? "Spinning…"
                : cooldown > 0
                  ? `Cooldown ${cooldown}s`
                  : dailyLimitReached
                    ? "Daily limit reached"
                    : `Spin · ${fmt(totalStake)} pts`}
          </button>

          {balance < totalStake && (
            <p className="text-center text-[9px] font-bold uppercase tracking-[0.2em] text-destructive/90">
              Need {fmt(totalStake - balance)} more pts ·{" "}
              <Link to="/wallet" className="underline">
                wallet
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="grid h-9 w-9 place-items-center rounded-[4px] bg-[var(--color-surface-2)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]/70 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
