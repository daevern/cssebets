import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins, Loader2, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipRack } from "@/components/arcade/ChipRack";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { RpsArena, type ArenaPhase } from "@/components/arcade/RpsArena";
import { RpsVerifyDialog } from "@/components/arcade/RpsVerifyDialog";
import { type RpsMove } from "@/lib/arcade/rps-math";
import { roundMoney } from "@/lib/accounting/money";

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
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-[4px] bg-[var(--color-surface-2)] px-2.5 py-1.5">
      <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
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
  /** Amount shown in the collect pop-up. */
  const [collected, setCollected] = useState(0);
  /** Total pot returned by the run (base stake + profit). */
  const [collectedPot, setCollectedPot] = useState(0);

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
          stake: wagerStake,
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

  // The ladder compounds: each win rolls the whole pot into the next round, so
  // the amount at risk is base stake x winMultiplier^(wins so far). Draws hold
  // the pot steady, a loss ends the run and the pot stays with the house.
  const runWins = ladderHistory.filter((h) => h.outcome === "WIN").length;
  const wagerStake = roundMoney(stake * winMult ** runWins);
  /** What the player takes home if the next round wins. */
  const nextPayout = roundMoney(wagerStake * winMult);
  const overMax = wagerStake > maxStake;

  const canPlay =
    ready &&
    !busy &&
    !cfg?.maintenance_mode &&
    balance >= wagerStake &&
    !overMax &&
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
    const lost = round?.outcome === "LOSS";
    if (lost) {
      // A single loss ends the run — the whole stake stays with the house,
      // exactly like busting a mine on Treasure Grid. Nothing is collectible.
      setLadderHistory([]);
      setRunNet(0);
    } else if (round) {
      // Wins and draws stay on the rail and keep the run alive.
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

  /** Bank the run: the pot is already in the wallet, so this just clears the rail. */
  const collectRun = () => {
    setCollectedPot(wagerStake);
    setCollected(runNet);
    setLadderHistory([]);
    setRunNet(0);
    setResultOpen(true);
    setPhase("IDLE");
    setPlayerMove(null);
    setRound(null);
    clientSeed.current = newSeed();
  };


  /** Only a run that is currently in profit can be banked. */
  const canCollect = phase === "IDLE" && !busy && runNet > 0 && ladderHistory.length > 0;


  const todayNet = profileQ.data?.todayNet ?? 0;
  const recent = profileQ.data?.recent ?? [];

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Balance" value={fmt(balance)} />
        <Stat
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <Stat
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

      <ArcadeResultDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone="win"
        headline="Collected"
        net={collectedPot}
        detail={`Pot banked to your balance — profit +${fmt(collected)} pts.`}
      />



      <RpsVerifyDialog
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        roundId={verifyId}
      />

      {/* Sticky console */}
      <div data-arcade-console className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 pb-[calc(64px+env(safe-area-inset-bottom))] backdrop-blur md:pb-0">
        <div className="mx-auto w-full max-w-4xl space-y-2 px-3 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-visible py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ChipRack
              values={chips}
              max={maxStake}
              value={stake}
              disabled={busy || runWins > 0 || ladderHistory.length > 0}
              onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
              size={44}
            />

            <div className="ml-auto shrink-0 text-right">
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                {runWins > 0 ? "Pot at risk" : "Stake"}
              </div>
              <div className="font-display text-xs font-bold tabular-nums">{fmt(wagerStake)} pts</div>
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--color-neon)]">
                Win pays {fmt(nextPayout)}
              </div>
            </div>

          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                phase === "SETTLED" ? nextRound : canCollect ? collectRun : undefined
              }
              disabled={phase !== "SETTLED" && !canCollect}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[4px] font-display text-xs font-bold uppercase tracking-[0.2em] transition-colors",
                phase === "SETTLED" || canCollect
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
              ) : canCollect ? (
                <>
                  <HandCoins className="h-3.5 w-3.5" /> Collect +{fmt(runNet)}
                </>
              ) : (
                <>
                  <Swords className="h-3.5 w-3.5" /> Pick a hand above
                </>
              )}
            </button>
          </div>




          {overMax && phase !== "SETTLED" ? (
            <p className="text-center text-[10px] uppercase tracking-[0.24em] text-amber-300">
              Pot is at the table limit — collect to bank it
            </p>
          ) : balance < wagerStake && phase !== "SETTLED" ? (
            <p className="text-center text-[10px] uppercase tracking-[0.24em] text-amber-300">
              Not enough points for this stake
            </p>
          ) : null}

        </div>
      </div>
    </div>
  );
}
