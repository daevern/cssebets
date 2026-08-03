import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins, Loader2, ShieldCheck, Swords, TrendingUp, Trophy, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { CasinoChip } from "@/components/arcade/CasinoChip";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { RpsArena, type ArenaPhase } from "@/components/arcade/RpsArena";
import { RpsVerifyDialog } from "@/components/arcade/RpsVerifyDialog";
import { type RpsMove } from "@/lib/arcade/rps-math";
import {
  getRpsConfig,
  getRpsProfile,
  getRpsRound,
  prepareRpsRound,
  settleRpsRound,
} from "@/lib/arcade/rps.functions";

export const Route = createFileRoute("/_authenticated/arcade/rps")({
  head: () => ({
    meta: [
      { title: "Rock–Paper–Scissors — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Rock–Paper–Scissors. The computer's move is committed before you choose, revealed simultaneously and verifiable in your browser.",
      },
      { property: "og:title", content: "Rock–Paper–Scissors — Arcade | cssebets" },
      {
        property: "og:description",
        content:
          "The computer commits its move before you pick. Simultaneous reveal, verifiable every round.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RpsPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `rps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 16);

/** Minimum time the concealed "shake" is shown so reveals feel simultaneous. */
const MIN_REVEAL_MS = 700;

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-[4px] bg-[var(--color-surface-2)] px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={cn(
          "font-display text-sm font-bold tabular-nums",
          tone === "up"
            ? "text-[var(--color-neon)]"
            : tone === "down"
              ? "text-red-400"
              : "text-[var(--color-ink)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RpsPage() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getRpsConfig);
  const fetchProfile = useServerFn(getRpsProfile);
  const prepareFn = useServerFn(prepareRpsRound);
  const settleFn = useServerFn(settleRpsRound);
  const recoverFn = useServerFn(getRpsRound);

  const configQ = useQuery({ queryKey: ["rps", "config"], queryFn: () => fetchConfig() });
  const profileQ = useQuery({ queryKey: ["rps", "profile"], queryFn: () => fetchProfile() });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 100));
  const winMult = Number(cfg?.win_multiplier ?? 1.9);
  
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [5, 10, 25, 50, 100];

  const balance = profileQ.data?.balance ?? 0;

  const [stake, setStake] = useState(10);
  const [phase, setPhase] = useState<ArenaPhase>("IDLE");
  const [playerMove, setPlayerMove] = useState<RpsMove | null>(null);
  const [round, setRound] = useState<any>(null);
  const [ladderHistory, setLadderHistory] = useState<
    Array<{ id: string; player: RpsMove | null; server: RpsMove | null; outcome: string }>
  >([]);
  const [resultOpen, setResultOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [commitmentVersion, setCommitmentVersion] = useState(0);
  /** Net points banked in the current run, cleared on collect. */
  const [runNet, setRunNet] = useState(0);

  const clientSeed = useRef(newSeed());
  /** The live commitment the player is about to play against. */
  const commitment = useRef<{ roundId: string; serverSeedHash: string; nonce: number } | null>(null);
  const idemKey = useRef<string | null>(null);
  const lockedAt = useRef<number>(0);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["rps", "profile"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  }, [qc]);

  /* ----------------------- Phase 1: commitment ----------------------- */

  const prepare = useMutation({
    mutationFn: () => prepareFn(),
    onSuccess: (res: any) => {
      commitment.current = {
        roundId: res.roundId,
        serverSeedHash: res.serverSeedHash,
        nonce: res.nonce,
      };
      setCommitmentVersion((version) => version + 1);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start a round."),
  });

  // A commitment always exists before the move buttons are usable.
  useEffect(() => {
    if (
      configQ.data &&
      !cfg?.maintenance_mode &&
      !commitment.current &&
      !prepare.isPending &&
      phase === "IDLE"
    ) {
      prepare.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configQ.data, phase, cfg?.maintenance_mode]);

  /* ------------------------ Phase 2: settle -------------------------- */

  const applySettled = useCallback(
    async (r: any) => {
      const elapsed = Date.now() - lockedAt.current;
      if (elapsed < MIN_REVEAL_MS) {
        await new Promise((res) => setTimeout(res, MIN_REVEAL_MS - elapsed));
      }
      setRound(r);
      setRunNet((n) => n + Number(r?.userNet ?? 0));
      setPhase("SETTLED");
      setResultOpen(true);
      commitment.current = null;
      idemKey.current = null;
      refresh();
    },
    [refresh],
  );

  const settle = useMutation({
    mutationFn: async (move: RpsMove) => {
      const c = commitment.current!;
      return settleFn({
        data: {
          roundId: c.roundId,
          playerChoice: move,
          clientSeed: clientSeed.current,
          stake,
          idempotencyKey: idemKey.current!,
          clientRevealMs: Date.now() - lockedAt.current,
        },
      });
    },
    onSuccess: (res: any) => applySettled(res.round),
    onError: async (e: any) => {
      // The round may have settled server-side even though the response was
      // lost. Recover by round id before ever charging or replaying anything.
      const c = commitment.current;
      if (c) {
        try {
          const rec: any = await recoverFn({ data: { roundId: c.roundId } });
          if (rec?.round) {
            await applySettled(rec.round);
            return;
          }
        } catch {
          /* fall through to the error path */
        }
      }
      toast.error(e?.message ?? "Could not play that round.");
      setPhase("IDLE");
      setPlayerMove(null);
      commitment.current = null;
      idemKey.current = null;
      refresh();
    },
  });

  const busy = settle.isPending || phase === "LOCKED" || phase === "REVEALING";
  const ready = Boolean(commitment.current) && !prepare.isPending && commitmentVersion >= 0;
  const canPlay =
    ready &&
    !busy &&
    !cfg?.maintenance_mode &&
    balance >= stake &&
    stake >= minStake &&
    stake <= maxStake;

  const choose = (move: RpsMove) => {
    if (!canPlay) return;
    idemKey.current = newKey();
    lockedAt.current = Date.now();
    setPlayerMove(move);
    setRound(null);
    setPhase("LOCKED");
    // Concealed shake, then the settled state flips both hands at once.
    setTimeout(() => setPhase((p) => (p === "LOCKED" ? "REVEALING" : p)), 250);
    settle.mutate(move);
  };

  const nextRound = () => {
    if (round) {
      // Every settled round is kept on the rail — wins, draws and losses.
      setLadderHistory((current) =>
        [
          ...current,
          {
            id: String(round.id),
            player: (round.playerChoice as RpsMove) ?? null,
            server: (round.serverChoice as RpsMove) ?? null,
            outcome: String(round.outcome ?? "DRAW"),
          },
        ].slice(-6),
      );
    }
    setPhase("IDLE");
    setPlayerMove(null);
    setRound(null);
    clientSeed.current = newSeed();
  };

  /** Bank the run: clears the rail and the running tally. */
  const collectRun = () => {
    const banked = runNet;
    setLadderHistory([]);
    setRunNet(0);
    setResultOpen(false);
    setPhase("IDLE");
    setPlayerMove(null);
    setRound(null);
    clientSeed.current = newSeed();
    toast.success(
      banked > 0
        ? `Collected +${fmt(banked)} pts`
        : banked < 0
          ? `Run closed · ${fmt(banked)} pts`
          : "Run closed",
    );
  };


  const runActive = ladderHistory.length > 0 || phase === "SETTLED" || runNet !== 0;

  const todayNet = profileQ.data?.todayNet ?? 0;
  const recent = profileQ.data?.recent ?? [];

  const outcomeTone = useMemo(() => {
    const n = Number(round?.userNet ?? 0);
    return n > 0 ? "win" : n < 0 ? "loss" : "push";
  }, [round]);

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat icon={Wallet} label="Balance" value={fmt(balance)} />
        <Stat
          icon={TrendingUp}
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <Stat
          icon={Trophy}
          label="W / D / L"
          value={`${profileQ.data?.todayWins ?? 0}/${profileQ.data?.todayDraws ?? 0}/${profileQ.data?.todayLosses ?? 0}`}
        />
      </div>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Rock–Paper–Scissors is under maintenance."}
        </div>
      )}

      <RpsArena
        phase={phase}
        playerMove={playerMove}
        serverMove={(round?.serverChoice as RpsMove) ?? null}
        outcome={round?.outcome ?? null}
        winMultiplier={winMult}
        history={ladderHistory}
        onChoose={choose}
        canPlay={canPlay}
      />



      {recent.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recent.map((r: any) => (
            <span
              key={r.id}
              title={`${r.player_choice} vs ${r.server_choice}`}
              className={cn(
                "shrink-0 rounded-[3px] px-2 py-1 font-mono text-[9px] font-bold",
                r.outcome === "WIN"
                  ? "bg-[var(--color-neon)]/20 text-[var(--color-neon)]"
                  : r.outcome === "LOSS"
                    ? "bg-red-500/15 text-red-400"
                    : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]",
              )}
            >
              {r.outcome === "WIN" ? "W" : r.outcome === "LOSS" ? "L" : "D"}
            </span>
          ))}
        </div>
      )}

      {round && (
        <ArcadeResultDialog
          open={resultOpen}
          onOpenChange={(v) => {
            setResultOpen(v);
            if (!v) nextRound();
          }}
          tone={outcomeTone as any}
          headline={
            round.outcome === "WIN" ? "You win" : round.outcome === "LOSS" ? "Computer wins" : "Draw"
          }
          net={Number(round.userNet ?? 0)}
          detail={`${round.playerChoice} vs ${round.serverChoice} · staked ${fmt(Number(round.stake ?? 0))} pts`}
          footer={
            <button
              type="button"
              onClick={() => {
                setResultOpen(false);
                setVerifyId(round.id);
              }}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[var(--color-surface-border)] px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]"
            >
              <ShieldCheck className="h-3 w-3" /> Verify
            </button>
          }
        />
      )}

      <RpsVerifyDialog
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        roundId={verifyId}
      />

      {/* Sticky console */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 pb-[calc(64px+env(safe-area-inset-bottom))] backdrop-blur md:pb-0">
        <div className="mx-auto w-full max-w-4xl space-y-2 px-3 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-visible py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((c) => (
              <CasinoChip
                key={c}
                value={c}
                selected={stake === c}
                disabled={busy || c > maxStake}
                onClick={() => setStake(Math.min(Math.max(c, minStake), maxStake))}
                size={44}
              />
            ))}
            <div className="ml-auto shrink-0 text-right">
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                Stake
              </div>
              <div className="font-display text-xs font-bold tabular-nums">{fmt(stake)} pts</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={phase === "SETTLED" ? nextRound : undefined}
              disabled={phase !== "SETTLED"}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[4px] font-display text-xs font-bold uppercase tracking-[0.2em] transition-colors",
                phase === "SETTLED"
                  ? "bg-[var(--color-neon)] text-black"
                  : "bg-[var(--color-neon)]/25 text-[var(--color-ink-muted)]",
              )}
            >
              {phase === "SETTLED" ? (
                "Play again"
              ) : busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revealing
                </>
              ) : (
                <>
                  <Swords className="h-3.5 w-3.5" /> Pick a hand above
                </>
              )}
            </button>

            {runActive && (
              <button
                type="button"
                onClick={collectRun}
                disabled={busy}
                className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--color-neon)] px-4 font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-neon)] transition-colors disabled:opacity-40"
              >
                <HandCoins className="h-3.5 w-3.5" />
                Collect{runNet !== 0 ? ` ${runNet > 0 ? "+" : ""}${fmt(runNet)}` : ""}
              </button>
            )}
          </div>



          {balance < stake && phase !== "SETTLED" && (
            <p className="text-center text-[10px] uppercase tracking-[0.24em] text-amber-300">
              Not enough points for this stake
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
