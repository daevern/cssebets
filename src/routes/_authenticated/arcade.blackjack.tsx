import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Spade,
  Wallet,
  CopyPlus,
  Hand,
  SplitSquareHorizontal,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BlackjackTable, type BlackjackState } from "@/components/arcade/BlackjackTable";
import { CasinoChip } from "@/components/arcade/CasinoChip";
import { BlackjackVerifyDialog } from "@/components/arcade/BlackjackVerifyDialog";
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
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: any;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-[var(--color-neon)]" />
      <div className="leading-tight">
        <div className="text-[8px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          {label}
        </div>
        <div
          className={cn(
            "font-mono text-[13px] font-bold tabular-nums",
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

  const busy = deal.isPending || hit.isPending || stand.isPending || dbl.isPending || split.isPending;

  const canDeal =
    !busy && !rules?.maintenance_mode && balance >= stake && stake >= minStake && stake <= maxStake;

  const clampStake = (v: number) => setStake(Math.max(minStake, Math.min(maxStake, Math.round(v))));

  const lastResult = settled ? state?.hand : null;
  const todayNet = profileQ.data?.todayNet ?? 0;

  const shellRef = useRef<HTMLDivElement | null>(null);
  const [shellHeight, setShellHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    let measuredWidth = window.innerWidth;
    const measure = () => {
      const el = shellRef.current;
      if (!el) return;
      if (window.innerWidth >= 768) {
        setShellHeight(undefined);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setShellHeight(Math.max(400, window.innerHeight - top - 78));
    };
    const handleResize = () => {
      if (Math.abs(window.innerWidth - measuredWidth) < 24) return;
      measuredWidth = window.innerWidth;
      measure();
    };
    measure();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      style={shellHeight ? { height: shellHeight } : undefined}
      className="-mb-24 flex min-h-0 flex-col gap-1 overflow-hidden md:mb-0 md:h-auto md:overflow-visible md:gap-3 md:pb-4"
    >
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <Stat label="Balance" value={balance.toLocaleString()} Icon={Wallet} />
        <Stat
          label="P/L today"
          value={`${todayNet > 0 ? "+" : ""}${todayNet.toLocaleString()}`}
          Icon={TrendingUp}
          tone={todayNet > 0 ? "up" : todayNet < 0 ? "down" : undefined}
        />
        <Stat
          label="W / L today"
          value={`${profileQ.data?.todayWins ?? 0} / ${profileQ.data?.todayLosses ?? 0}`}
          Icon={Trophy}
        />
      </div>

      {rules?.maintenance_mode && (
        <div className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          {rules.announcement ?? "Blackjack is under maintenance."}
        </div>
      )}

      <div className="relative -mx-3 min-h-[240px] flex-1 md:mx-[calc(50%-50vw)] md:min-h-[540px]">
        <BlackjackTable state={state} />
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

      <div className="z-20 mx-auto w-full max-w-xl shrink-0 space-y-1.5 px-0 pt-1 md:space-y-2 md:pt-3">
        {inPlay ? (
          <div className="flex h-9 w-full items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] font-display text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            Your move
          </div>
        ) : (
          <button
            type="button"
            disabled={!canDeal}
            onClick={() => deal.mutate()}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-1.5 rounded-full font-display text-[10px] font-bold uppercase tracking-[0.16em] transition-all",
              canDeal
                ? "bg-[var(--color-neon)] text-black shadow-[0_0_24px_rgba(var(--neon-glow-rgb),0.45)] active:brightness-95"
                : "border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]",
            )}
          >
            {deal.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Spade className="h-3.5 w-3.5" />
                {settled ? "Deal again" : "Place bet"}
                <span className="font-mono text-[9px]">· {stake} pts</span>
              </>
            )}
          </button>
        )}

        <div className="grid grid-cols-4 gap-1">
          <ActionTile
            label="Double"
            glyph="x2"
            disabled={!inPlay || busy || !canDouble}
            loading={dbl.isPending}
            onClick={() => dbl.mutate()}
          />
          <ActionTile
            label="Hit"
            Icon={CopyPlus}
            disabled={!inPlay || busy}
            loading={hit.isPending}
            onClick={() => hit.mutate()}
          />
          <ActionTile
            label="Stand"
            Icon={Hand}
            disabled={!inPlay || busy}
            loading={stand.isPending}
            onClick={() => stand.mutate()}
          />
          <ActionTile
            label="Split"
            Icon={SplitSquareHorizontal}
            disabled={!inPlay || busy || !canSplit}
            loading={split.isPending}
            onClick={() => split.mutate()}
          />
        </div>

        <div className="flex h-8 items-center gap-1.5 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2">
          <span className="text-[9px] font-bold text-[var(--color-ink-muted)]">PTS</span>
          <span className="flex-1 font-mono text-[13px] font-bold tabular-nums text-[var(--color-neon)]">
            {stake.toLocaleString()}
          </span>
          {(
            [
              ["1/2", () => clampStake(stake / 2)],
              ["2x", () => clampStake(stake * 2)],
              ["Max", () => clampStake(Math.min(balance, maxStake))],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              disabled={inPlay || busy}
              onClick={fn}
              className="rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)]/50 hover:text-[var(--color-neon)] disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-h-10 items-center justify-between gap-1 overflow-x-auto px-1.5 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.slice(0, 6).map((c) => (
            <CasinoChip
              key={c}
              value={c}
              selected={stake === c}
              disabled={inPlay || busy || c > maxStake}
              onClick={() => clampStake(c)}
              size={32}
            />
          ))}
        </div>

        {balance < stake && !inPlay && (
          <p className="text-center text-[10px] uppercase tracking-[0.24em] text-amber-300">
            Not enough points for this stake
          </p>
        )}
      </div>

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
        "flex h-9 flex-col items-center justify-center rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] transition-colors md:h-[54px] md:gap-1",
        "hover:border-[var(--color-neon)]/40 disabled:opacity-35",
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-[var(--color-neon)]" />
      ) : glyph ? (
        <span className="font-mono text-[11px] font-black leading-none text-[var(--color-neon)]">
          {glyph}
        </span>
      ) : (
        Icon && <Icon className="h-3 w-3 text-[var(--color-neon)]" />
      )}
      <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink)]">
        {label}
      </span>
    </button>
  );
}
