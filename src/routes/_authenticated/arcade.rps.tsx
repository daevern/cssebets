import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins, Loader2, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArcadeStage } from "@/components/arcade/ArcadeStage";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockNote,
  DockPrimary,
  DockReadout,
  DockRow,
} from "@/components/arcade/ControlDock";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import { RpsArena, type ArenaPhase } from "@/components/arcade/RpsArena";
import { RpsVerifyDialog } from "@/components/arcade/RpsVerifyDialog";
import { rpsLadderMultiplier, type RpsMove } from "@/lib/arcade/rps-math";
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
  
  // Per-step win ladder: 1.35 on wins #1 and #2, 1.85 on win #3, then the
  // tail rate (doubling) on every step after that.
  const tailMult = Number(cfg?.ladder_tail_multiplier ?? 2);
  const ladder: number[] =
    Array.isArray(cfg?.ladder_multipliers) && cfg.ladder_multipliers.length
      ? cfg.ladder_multipliers.map((m: any) => Number(m))
      : [1.35, 1.35, 1.85];

  
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
  /**
   * The previous settled round id, when the next round is a ladder
   * continuation. The server re-derives the ladder position from this chain
   * itself (a round can only ever be claimed as a parent once) — the client
   * can never inflate its own win depth to dodge the opening rate.
   */
  const chainParentId = useRef<string | null>(null);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["rps", "profile"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  }, [qc]);

  /* ----------------------- Phase 1: commitment ----------------------- */

  const prepare = useMutation({
    mutationFn: () =>
      prepareFn({ data: { parentRoundId: chainParentId.current ?? undefined } }),
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

  // The ladder compounds: each win rolls the whole pot into the next round.
  // Wins #1 and #2 pay the opening rate, win #3 pays the step-3 rate, and
  // every win after that pays the tail (doubling) rate. Draws hold the pot
  // steady, a loss ends the run and the pot stays with the house.
  const runWins = ladderHistory.filter((h) => h.outcome === "WIN").length;
  const wagerStake = roundMoney(stake * rpsLadderMultiplier(ladder, tailMult, runWins));
  /** What the player takes home if the next round wins. */
  const nextPayout = roundMoney(stake * rpsLadderMultiplier(ladder, tailMult, runWins + 1));

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

  const nextRound = useCallback(() => {
    const lost = round?.outcome === "LOSS";
    if (lost) {
      // A single loss ends the run — the whole stake stays with the house,
      // exactly like busting a mine on Treasure Grid. Nothing is collectible.
      setLadderHistory([]);
      setRunNet(0);
      chainParentId.current = null;
    } else if (round) {
      // Wins and draws stay on the rail and keep the run alive — and chain
      // the next round to this one server-side, so the next win resolves at
      // the correct ladder position instead of always the opening rate.
      chainParentId.current = String(round.id);
      setLadderHistory((current) =>
        [
          ...current,
          {
            id: String(round.id),
            player: (round.playerChoice as RpsMove) ?? null,
            server: (round.serverChoice as RpsMove) ?? null,
            outcome: String(round.outcome ?? "DRAW"),
          },
        ].slice(-40),
      );
    }
    setPhase("IDLE");
    setPlayerMove(null);
    setRound(null);
    clientSeed.current = newSeed();
  }, [round]);

  // Wins and draws roll straight into the next round; only a loss needs the
  // player to tap "Play again".
  useEffect(() => {
    if (phase !== "SETTLED" || !round || round.outcome === "LOSS") return;
    const t = window.setTimeout(() => nextRound(), 900);
    return () => window.clearTimeout(t);
  }, [phase, round, nextRound]);


  /** Bank the run: the pot is already in the wallet, so this just clears the rail. */
  const collectRun = () => {
    setCollectedPot(wagerStake);
    setCollected(runNet);
    setLadderHistory([]);
    setRunNet(0);
    chainParentId.current = null;
    setResultOpen(true);
    setPhase("IDLE");
    setPlayerMove(null);
    setRound(null);
    clientSeed.current = newSeed();
  };


  /** Only a run that is currently in profit can be banked. */
  const canCollect = phase === "IDLE" && !busy && runNet > 0 && ladderHistory.length > 0;


  const todayNet = profileQ.data?.todayNet ?? 0;

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <div className="sticky top-14 z-20 -mx-3 rounded-b-xl bg-black/45 px-3 py-1 backdrop-blur-md md:top-16 grid grid-cols-3 gap-1.5">
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

      <ArcadeStage>
      <RpsArena
        phase={phase}
        playerMove={playerMove}
        serverMove={(round?.serverChoice as RpsMove) ?? null}
        outcome={round?.outcome ?? null}
        ladder={ladder}
        tailMultiplier={tailMult}

        history={ladderHistory}
        onChoose={choose}
        canPlay={canPlay}
      />
      </ArcadeStage>




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

      {/* Shared control dock */}
      <ControlDock>
        <DockRow scroll>
          <ChipRack
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy || runWins > 0 || ladderHistory.length > 0}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />

          <DockReadout
            className="ml-auto"
            label={runWins > 0 ? "Pot at risk" : "Stake"}
            value={`${fmt(wagerStake)} pts`}
            hint={`Win pays ${fmt(nextPayout)}`}
          />
        </DockRow>

        {(() => {
          // Only a loss stops the run; wins and draws auto-advance, so the
          // button stays on "Collect".
          const showPlayAgain = phase === "SETTLED" && round?.outcome === "LOSS";
          return (
            <DockPrimary
              onClick={showPlayAgain ? nextRound : canCollect ? collectRun : undefined}
              disabled={!showPlayAgain && !canCollect}
              active={showPlayAgain || canCollect}
            >
              {showPlayAgain ? (
                "Play again"
              ) : busy || phase === "SETTLED" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Revealing
                </>
              ) : canCollect ? (
                <>
                  <HandCoins className="h-4 w-4" /> Collect +{fmt(runNet)}
                </>
              ) : (
                <>
                  <Swords className="h-4 w-4" /> Pick a hand above
                </>
              )}
            </DockPrimary>
          );
        })()}

        {overMax && phase !== "SETTLED" ? (
          <DockNote>Pot is at the table limit — collect to bank it</DockNote>
        ) : balance < wagerStake && phase !== "SETTLED" ? (
          <DockNote>Not enough points for this stake</DockNote>
        ) : null}
      </ControlDock>

    </div>
  );
}
