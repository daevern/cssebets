import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Layers, RefreshCw, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
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
import { PokerBoard } from "@/components/arcade/PokerBoard";
import { MiniVerifyDialog } from "@/components/arcade/MiniVerifyDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useArcadeSound } from "@/lib/arcade/sound";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import { POKER_CATEGORY_LABELS, type PokerCategory } from "@/lib/arcade/mini-math";
import {
  dealPoker,
  drawPoker,
  getActivePoker,
  getMiniConfig,
  getMiniProfile,
} from "@/lib/arcade/mini.functions";

export const Route = createFileRoute("/_authenticated/arcade/poker")({
  head: () => ({
    meta: [
      { title: "Video Poker — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair Jacks or Better video poker. Hold the cards you want, draw the rest and get paid on the published paytable.",
      },
      { property: "og:title", content: "Video Poker — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Jacks or Better, dealt from a seed committed before you play.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PokerPage,
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const newKey = () => `poker_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
/** Stagger (4x130ms) + slide (560ms) + flip (420ms) for the last drawn card. */
const POKER_REVEAL_MS = 1750;
const newSeed = () => Math.random().toString(36).slice(2, 16);

function PokerPage() {
  const qc = useQueryClient();
  const { play, playFor } = useArcadeSound("poker");

  const fetchConfig = useServerFn(getMiniConfig);
  const fetchProfile = useServerFn(getMiniProfile);
  const fetchActive = useServerFn(getActivePoker);
  const dealFn = useServerFn(dealPoker);
  const drawFn = useServerFn(drawPoker);

  const configQ = useQuery({
    queryKey: ["mini", "poker", "config"],
    queryFn: () => fetchConfig({ data: { product: "poker" } }),
  });
  const profileQ = useQuery({
    queryKey: ["mini", "poker", "profile"],
    queryFn: () => fetchProfile({ data: { product: "poker" } }),
  });
  const activeQ = useQuery({
    queryKey: ["mini", "poker", "active"],
    queryFn: () => fetchActive({}),
    staleTime: 0,
  });

  const cfg = configQ.data?.config as any;
  const minStake = Number(cfg?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(cfg?.max_stake ?? 20));
  const chips: number[] =
    Array.isArray(cfg?.chip_values) && cfg.chip_values.length
      ? cfg.chip_values.map((c: any) => Number(c))
      : [1, 5, 10, 25, 50];
  const balance = profileQ.data?.balance ?? 0;
  const todayNet = profileQ.data?.todayNet ?? 0;

  const [stake, setStake] = useState(5);
  const [round, setRound] = useState<any>(null);
  const [holds, setHolds] = useState<number[]>([]);
  const [resultOpen, setResultOpen] = useState(false);
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [revealed, setRevealed] = useState(true);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const { beat, run: runBeat } = useSettleBeat(380);

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  useEffect(() => {
    const r = activeQ.data?.round;
    if (r && !round) {
      setRound(r);
      setStake(Number(r.stake ?? 5));
    }
  }, [activeQ.data, round]);

  const state = (round?.state ?? {}) as any;
  const live = round?.status === "ACTIVE";
  const stage: "idle" | "deal" | "final" = !round
    ? "idle"
    : live
      ? "deal"
      : "final";
  const hand: number[] = ((state.final_hand ?? state.hand ?? []) as any[]).map((c) => Number(c));
  const dealtHand: number[] = ((state.dealt ?? state.hand ?? []) as any[]).map((c) => Number(c));
  const category = (state.category ?? null) as PokerCategory | null;
  /** After settlement the server's hold list is the source of truth. */
  const shownHolds: number[] =
    stage === "final" && Array.isArray(state.holds)
      ? (state.holds as any[]).map((h) => Number(h))
      : holds;

  const dealMut = useMutation({
    mutationFn: () =>
      dealFn({ data: { stake, clientSeed: newSeed(), idempotencyKey: newKey() } }),
    onMutate: () => {
      playFor("poker", "spin-start");
      setHolds([]);
    },
    onSuccess: (res: any) => {
      setRound(res.round);
      setResultOpen(false);
      setExpiredOpen(false);
      setRevealed(true);
      playFor("poker", "reveal-tick");
      qc.invalidateQueries({ queryKey: ["mini", "poker", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not deal that hand."),
  });

  const drawMut = useMutation({
    mutationFn: () => drawFn({ data: { roundId: round.id, holds } }),
    onSuccess: (res: any) => {
      const r = res.round;
      if (r?.outcome === "VOID") {
        qc.setQueryData(["mini", "poker", "active"], { round: null });
        setRound(null);
        setHolds([]);
        setRevealed(true);
        setResultOpen(false);
        setExpiredOpen(true);
        qc.invalidateQueries({ queryKey: ["mini", "poker", "active"] });
        qc.invalidateQueries({ queryKey: ["mini", "poker", "profile"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        return;
      }
      setRevealed(false);
      setRound(r);
      // Let every replaced card slide out of the shoe and flip before we
      // announce the outcome.
      window.setTimeout(() => {
        setRevealed(true);
        playFor("poker", "settle");
        runBeat(() => setResultOpen(true));
      }, POKER_REVEAL_MS);
      qc.invalidateQueries({ queryKey: ["mini", "poker", "profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => {
      const message = e?.message ?? "Could not draw.";
      if (message.includes("expired")) {
        qc.setQueryData(["mini", "poker", "active"], { round: null });
        setRound(null);
        setHolds([]);
        setRevealed(true);
        setExpiredOpen(true);
        qc.invalidateQueries({ queryKey: ["mini", "poker", "active"] });
        qc.invalidateQueries({ queryKey: ["mini", "poker", "profile"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        return;
      }
      toast.error(message);
    },
  });

  const busy = dealMut.isPending || drawMut.isPending;
  const canDeal = !busy && !live && !cfg?.maintenance_mode && balance >= stake && stake >= minStake;
  const won = round?.outcome === "WIN";

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <HudBar game="poker">
        <HudPlaque
          game="poker"
          className="flex-1"
          label="Balance"
          value={<AnimatedBalance value={balance} />}
        />
        <HudPlaque
          game="poker"
          className="flex-1"
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${fmt(todayNet)}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <FairnessPlaque game="poker" rtpLabel={arcadeFairness("poker").rtpLabel} tag="Fair" />
      </HudBar>

      {cfg?.maintenance_mode && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {cfg.announcement ?? "Video Poker is under maintenance."}
        </div>
      )}

      <div className="relative isolate">
        <ArcadeGlow game="poker" />
        <ArcadeStage game="poker" className="relative z-10">
          <ArcadeEntrance game="poker" className="relative">
            <MiniCabinetTitle game="poker" title="Video Poker" />
            <SettlePlaque
              game="poker"
              show={beat}
              label={won ? "Hand pays" : "No pay"}
              value={won ? `${fmt(Number(round?.multiplier ?? 0))}×` : "—"}
            />
            <PokerBoard
              hand={hand}
              dealt={dealtHand}
              holds={shownHolds}
              stage={stage}
              category={category}
              stake={stake}
              disabled={busy}
              roundKey={round?.id ?? "idle"}
              revealed={revealed}
              onToggleHold={(i) => {
                play("chip");
                setHolds((prev) =>
                  prev.includes(i) ? prev.filter((h) => h !== i) : [...prev, i],
                );
              }}
            />
          </ArcadeEntrance>
        </ArcadeStage>
      </div>

      <RecentResultsStrip
        game="poker"
        empty="No hands yet"
        items={(profileQ.data?.recent ?? []).slice(0, 12).map((r: any) => ({
          key: r.id,
          label: r.outcome === "WIN" ? `${fmt(r.multiplier)}×` : "—",
          tone: r.outcome === "WIN" ? ("win" as const) : ("loss" as const),
        }))}
        trailing={
          round?.id ? <ArcadeVerifyCue game="poker" onClick={() => setVerifyId(round.id)} /> : null
        }
      />

      <ArcadeResultDialog
        game="poker"
        open={resultOpen}
        onOpenChange={setResultOpen}
        tone={won ? "win" : "loss"}
        headline={won ? "Hand pays" : "No qualifying hand"}
        net={Number(round?.userNet ?? 0)}
        stake={Number(round?.stake ?? stake)}
        ratio={Number(round?.multiplier ?? 0)}
        detail={category ? POKER_CATEGORY_LABELS[category] : "Jacks or Better"}
      />

      <MiniVerifyDialog
        product="poker"
        open={Boolean(verifyId)}
        onOpenChange={(v) => !v && setVerifyId(null)}
        round={round}
      />

      <Dialog open={expiredOpen} onOpenChange={setExpiredOpen}>
        <StencilDialogContent
          kicker="Video Poker"
          title="That hand expired"
          description="Your stake has been returned. Start a fresh hand when you're ready."
          footer={
            <Button
              type="button"
              onClick={() => dealMut.mutate()}
              disabled={dealMut.isPending || balance < stake}
              className="h-11 rounded-full px-5 font-display text-[11px] font-bold uppercase tracking-[0.08em]"
            >
              {dealMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Deal new round
            </Button>
          }
        />
      </Dialog>

      <ControlDock game="poker">
        <DockRow scroll>
          <ChipRack
            game="poker"
            values={chips}
            max={maxStake}
            value={stake}
            disabled={busy || Boolean(live)}
            onSelect={(c) => setStake(Math.min(Math.max(c, minStake), maxStake))}
            size={44}
          />
          <DockReadout
            className="ml-auto"
            label="Top pay"
            value="250×"
            hint={`Royal wins ${fmt(stake * 250)}`}
          />
        </DockRow>

        {live ? (
          <DockPrimary
            onClick={() => {
              play("button");
              drawMut.mutate();
            }}
            disabled={busy}
            active={!busy}
          >
            {drawMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Drawing
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Draw · hold {holds.length}
              </>
            )}
          </DockPrimary>
        ) : (
          <DockPrimary
            onClick={() => {
              play("button");
              dealMut.mutate();
            }}
            disabled={!canDeal}
            active={canDeal}
          >
            {dealMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Dealing
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" /> Deal · {fmt(stake)}
              </>
            )}
          </DockPrimary>
        )}

        {live ? <DockNote>Tap cards to hold, then draw</DockNote> : null}
        {!live && balance < stake ? <DockNote>Not enough points for this stake</DockNote> : null}
      </ControlDock>
    </div>
  );
}
