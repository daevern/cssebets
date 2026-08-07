import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Spade,
  CopyPlus,
  Hand,
  SplitSquareHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BlackjackTable, type BlackjackState } from "@/components/arcade/BlackjackTable";
import { ChipRack } from "@/components/arcade/ChipRack";
import {
  ControlDock,
  DockIconButton,
  DockNote,
  DockPrimary,
  DockRow,
} from "@/components/arcade/ControlDock";
import { BlackjackVerifyDialog } from "@/components/arcade/BlackjackVerifyDialog";
import { ArcadeResultDialog } from "@/components/arcade/ArcadeResultDialog";
import {
  doubleBlackjack,
  getActiveBlackjackHand,
  getBlackjackConfig,
  getBlackjackProfile,
  hitBlackjack,
  splitBlackjack,
  standBlackjack,
  startBlackjackHand,
} from "@/lib/arcade/blackjack.functions";

export const Route = createFileRoute("/_authenticated/arcade/blackjack")({
  head: () => ({
    meta: [
      { title: "Blackjack — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Provably fair single-player Blackjack. Stake points straight from your wallet, beat the dealer and get paid back into your wallet.",
      },
      { property: "og:title", content: "Blackjack — Arcade | cssebets" },
      {
        property: "og:description",
        content: "Provably fair single-player Blackjack played with wallet points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlackjackPage,
});

const newKey = () => `bj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const newSeed = () => Math.random().toString(36).slice(2, 14);

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
      <div className="leading-tight">
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
    </div>
  );
}

function BlackjackPage() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getBlackjackConfig);
  const fetchProfile = useServerFn(getBlackjackProfile);
  const fetchActive = useServerFn(getActiveBlackjackHand);
  const startFn = useServerFn(startBlackjackHand);
  const hitFn = useServerFn(hitBlackjack);
  const standFn = useServerFn(standBlackjack);
  const doubleFn = useServerFn(doubleBlackjack);
  const splitFn = useServerFn(splitBlackjack);

  const configQ = useQuery({ queryKey: ["blackjack", "config"], queryFn: () => fetchConfig() });
  const profileQ = useQuery({ queryKey: ["blackjack", "profile"], queryFn: () => fetchProfile() });
  const activeQ = useQuery({ queryKey: ["blackjack", "active"], queryFn: () => fetchActive() });

  const [state, setState] = useState<BlackjackState | null>(null);
  const [stake, setStake] = useState(10);
  const [resultOpen, setResultOpen] = useState(false);
  const [tableBusy, setTableBusy] = useState(false);
  const shownResultRef = useRef<string | null>(null);

  const clientSeed = useRef(newSeed());

  useEffect(() => {
    if (!state && activeQ.data?.state) setState(activeQ.data.state as BlackjackState);
  }, [activeQ.data, state]);

  const rules = configQ.data?.rules as any;
  const balance = profileQ.data?.balance ?? 0;
  const minStake = Number(rules?.min_stake ?? 1);
  const maxStake = Math.max(minStake, Number(rules?.max_stake ?? 100));
  const chips: number[] =
    Array.isArray(rules?.chip_values) && rules.chip_values.length
      ? rules.chip_values.map((c: any) => Number(c))
      : [5, 10, 25, 50, 100];

  useEffect(() => {
    setStake((s) => Math.min(Math.max(s, minStake), maxStake));
  }, [minStake, maxStake]);

  const activeHand = useMemo(
    () => (state?.playerHands ?? []).find((h: any) => h.status === "ACTIVE"),
    [state],
  );
  const inPlay = state?.hand?.status === "PLAYER_TURN" && !!activeHand;
  const settled = state?.hand?.status === "COMPLETED";

  // The outcome pop-up waits until every card has finished sliding and
  // flipping — the reveal itself carries the suspense.
  useEffect(() => {
    const h = state?.hand;
    if (!h || h.status !== "COMPLETED") return;
    if (shownResultRef.current === h.id) return;
    // Restart the wait whenever the table reports motion, then open once
    // everything has landed and flipped.
    const t = window.setTimeout(() => {
      if (tableBusy) return;
      shownResultRef.current = h.id;
      setResultOpen(true);
    }, 520);
    return () => window.clearTimeout(t);
  }, [state?.hand?.id, state?.hand?.status, tableBusy]);



  const activeCards = useMemo(
    () => (state?.cards ?? []).filter((c: any) => c.playerHandId === activeHand?.id),
    [state, activeHand],
  );
  const canDouble =
    inPlay &&
    !!rules?.double_allowed &&
    activeCards.length === 2 &&
    !activeHand?.is_doubled &&
    (!activeHand?.is_split || !!rules?.double_after_split) &&
    balance >= Number(activeHand?.stake ?? stake);
  const canSplit =
    inPlay &&
    activeCards.length === 2 &&
    activeCards[0]?.rank != null &&
    activeCards[1]?.rank != null &&
    Math.min(activeCards[0].rank as number, 10) === Math.min(activeCards[1].rank as number, 10) &&
    (state?.playerHands.length ?? 1) < Number(rules?.max_split_hands ?? 4) &&
    balance >= Number(activeHand?.stake ?? stake);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["blackjack", "profile"] });
    qc.invalidateQueries({ queryKey: ["blackjack", "active"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  const onError = (e: any) => {
    toast.error(e?.message ?? "Something went wrong.");
    refresh();
    activeQ.refetch().then((r) => r.data?.state && setState(r.data.state as BlackjackState));
  };

  const applied = (res: any) => {
    setState(res.state as BlackjackState);
    refresh();
  };

  const deal = useMutation({
    mutationFn: () =>
      startFn({ data: { stake, clientSeed: clientSeed.current, idempotencyKey: newKey() } }),
    onSuccess: applied,
    onError,
  });

  const actionArgs = () => ({
    handId: state!.hand.id,
    playerHandId: activeHand!.id,
    stateVersion: state!.hand.state_version,
    idempotencyKey: newKey(),
  });

  const hit = useMutation({ mutationFn: () => hitFn({ data: actionArgs() }), onSuccess: applied, onError });
  const stand = useMutation({ mutationFn: () => standFn({ data: actionArgs() }), onSuccess: applied, onError });
  const dbl = useMutation({ mutationFn: () => doubleFn({ data: actionArgs() }), onSuccess: applied, onError });
  const split = useMutation({ mutationFn: () => splitFn({ data: actionArgs() }), onSuccess: applied, onError });

  const busy =
    tableBusy ||
    deal.isPending ||
    hit.isPending ||
    stand.isPending ||
    dbl.isPending ||
    split.isPending;

  const handleBusy = useCallback((b: boolean) => setTableBusy(b), []);


  const canDeal =
    !busy && !rules?.maintenance_mode && balance >= stake && stake >= minStake && stake <= maxStake;

  const clampStake = (v: number) => setStake(Math.max(minStake, Math.min(maxStake, Math.round(v))));

  const lastResult = settled ? state?.hand : null;
  const todayNet = profileQ.data?.todayNet ?? 0;

  return (
    <div className="flex flex-col gap-1 md:gap-3">
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        <Stat label="Balance" value={balance.toLocaleString()} />
        <Stat
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${todayNet.toLocaleString()}`}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <Stat
          label="W / L today"
          value={`${profileQ.data?.todayWins ?? 0} / ${profileQ.data?.todayLosses ?? 0}`}
        />
      </div>

      {rules && (
        <div className="shrink-0 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {[
              `${rules.deck_count} decks`,
              rules.dealer_hits_soft_17 ? "Dealer hits soft 17" : "Dealer stands soft 17",
              rules.dealer_peek ? "Peek" : "No peek (ENHC)",
              rules.double_after_split ? "DAS" : "No DAS",
              `Split to ${rules.max_split_hands}`,
              `Blackjack pays ${Number(rules.blackjack_payout) === 1.5 ? "3:2" : Number(rules.blackjack_payout) === 1.3333 || Math.abs(Number(rules.blackjack_payout) - 4 / 3) < 0.01 ? "4:3" : `${Number(rules.blackjack_payout)}x`}`,
              `Rules v${rules.version}`,
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      {rules?.maintenance_mode && (
        <div className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {rules.announcement ?? "Blackjack is under maintenance."}
        </div>
      )}


      <div className="relative mx-[calc(50%-50vw)] h-[320px] w-screen md:h-[520px]">
        <BlackjackTable state={state} onBusyChange={handleBusy} />
      </div>

      {lastResult && (
        <div className="hidden shrink-0 items-center justify-between gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-1.5 md:flex">
          <div className="leading-tight">
            <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
              {String(lastResult.result ?? "").replace("_", " ") || "Result"}
            </div>
            <div
              className={cn(
                "font-mono text-[13px] font-bold tabular-nums",
                Number(lastResult.user_net) > 0
                  ? "text-[var(--color-neon)]"
                  : Number(lastResult.user_net) < 0
                    ? "text-red-400"
                    : "text-[var(--color-ink)]",
              )}
            >
              {Number(lastResult.user_net) > 0 ? "+" : ""}
              {Number(lastResult.user_net ?? 0).toLocaleString()} pts
            </div>
          </div>
          <BlackjackVerifyDialog
            handId={lastResult.id}
            serverSeedHash={lastResult.server_seed_hash}
            clientSeed={lastResult.client_seed}
            nonce={lastResult.nonce}
          />
        </div>
      )}

      {lastResult && (
        <ArcadeResultDialog
          open={resultOpen}
          onOpenChange={setResultOpen}
          tone={
            Number(lastResult.user_net) > 0
              ? "win"
              : Number(lastResult.user_net) < 0
                ? "loss"
                : "push"
          }
          headline={
            Number(lastResult.user_net) > 0
              ? String(lastResult.result) === "BLACKJACK"
                ? "Blackjack!"
                : "You win"
              : Number(lastResult.user_net) < 0
                ? "Dealer wins"
                : "Push"
          }
          net={Number(lastResult.user_net ?? 0)}
          detail={String(lastResult.result ?? "").replace("_", " ")}
          footer={
            <BlackjackVerifyDialog
              handId={lastResult.id}
              serverSeedHash={lastResult.server_seed_hash}
              clientSeed={lastResult.client_seed}
              nonce={lastResult.nonce}
            />
          }
        />
      )}

      <ControlDock maxWidth="max-w-xl">
        <DockRow scroll>
          <ChipRack
            values={chips}
            max={maxStake}
            value={stake}
            disabled={inPlay || busy}
            onSelect={(c) => clampStake(c)}
            size={44}
          />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DockIconButton
              onClick={() => dbl.mutate()}
              disabled={!inPlay || busy || !canDouble}
              title="Double"
              className="font-mono text-[12px] font-black text-[var(--color-neon)]"
            >
              {dbl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "2×"}
            </DockIconButton>
            <DockIconButton
              onClick={() => hit.mutate()}
              disabled={!inPlay || busy}
              title="Hit"
            >
              {hit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CopyPlus className="h-4 w-4 text-[var(--color-neon)]" />
              )}
            </DockIconButton>
            <DockIconButton
              onClick={() => stand.mutate()}
              disabled={!inPlay || busy}
              title="Stand"
            >
              {stand.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Hand className="h-4 w-4 text-[var(--color-neon)]" />
              )}
            </DockIconButton>
            <DockIconButton
              onClick={() => split.mutate()}
              disabled={!inPlay || busy || !canSplit}
              title="Split"
            >
              {split.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SplitSquareHorizontal className="h-4 w-4 text-[var(--color-neon)]" />
              )}
            </DockIconButton>
          </div>
        </DockRow>


        {!inPlay ? (
          <DockPrimary
            disabled={!canDeal}
            active={canDeal}
            loading={deal.isPending}
            onClick={() => deal.mutate()}
          >
            <Spade className="h-4 w-4" />
            {settled ? "Deal again" : "Place bet"}
            <span className="font-mono text-[11px]">· {stake} pts</span>
          </DockPrimary>
        ) : (
          <div className="flex h-[52px] w-full items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            {tableBusy ? "Dealing…" : "Your move"}
          </div>
        )}

        {balance < stake && !inPlay && <DockNote>Not enough points for this stake</DockNote>}
      </ControlDock>


      <p className="hidden text-center text-[10px] leading-relaxed text-[var(--color-ink-muted)] md:block">
        Played with wallet points. Every shoe is shuffled from a committed server seed and your
        client seed.
      </p>
    </div>
  );
}

function ActionTile({
  label,
  glyph,
  Icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  glyph?: string;
  Icon?: any;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl bg-[var(--color-surface-2)] transition-colors md:h-12",
        "hover:bg-[var(--color-surface-2)]/70 disabled:opacity-35",
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-neon)]" />
      ) : glyph ? (
        <span className="font-mono text-[12px] font-black leading-none text-[var(--color-neon)]">
          {glyph}
        </span>
      ) : (
        Icon && <Icon className="h-4 w-4 text-[var(--color-neon)]" />
      )}
      <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-ink)]">
        {label}
      </span>
    </button>

  );
}
