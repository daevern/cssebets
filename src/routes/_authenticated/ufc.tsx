import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listUfcFights, placeUfcBet } from "@/lib/ufc.functions";
import { Loader2, X } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ufc")({
  head: () => ({
    meta: [
      { title: "UFC 329 — CSSEBets" },
      { name: "description", content: "Live UFC 329 main and co-main event markets: moneyline, method of victory, round betting." },
    ],
  }),
  component: UfcPage,
});

type Market = {
  fight_id: string;
  market_type: "moneyline" | "method" | "round";
  selection_key: string;
  label: string;
  odds: number;
  is_active: boolean;
  updated_at: string;
};

type Fight = {
  id: string;
  fighter_a: string;
  fighter_b: string;
  commence_time: string;
  card_position: "main" | "co_main" | "other";
  scheduled_rounds: 3 | 5;
  status: string;
  winner: string | null;
  markets: Market[];
};

function useCountUp(target: number) {
  const [val, setVal] = useState(target);
  useEffect(() => {
    setVal(target);
  }, [target]);
  return val;
}

function UfcPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUfcFights);

  const { data, isLoading } = useQuery({
    queryKey: ["ufc-fights"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });

  // Realtime push
  useEffect(() => {
    const channel = supabase
      .channel("ufc-markets")
      .on("postgres_changes", { event: "*", schema: "public", table: "ufc_fight_markets" }, () => {
        qc.invalidateQueries({ queryKey: ["ufc-fights"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const [betCtx, setBetCtx] = useState<{ fight: Fight; market: Market } | null>(null);

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-dim)]" />
      </div>
    );
  }

  if (!data?.event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-[var(--ink)]">
        <h1 className="text-2xl font-bold">UFC</h1>
        <p className="mt-3 text-sm text-[var(--ink-dim)]">No UFC event is currently active.</p>
      </div>
    );
  }

  const fights = (data.fights as unknown as Fight[]) ?? [];
  // Order: main first, then co-main
  const ordered = [...fights].sort((a, b) => (a.card_position === "main" ? -1 : b.card_position === "main" ? 1 : 0));

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24 text-[var(--ink)]">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Prediction Markets</div>
        <h1 className="mt-1 text-2xl font-black">{data.event.name} — Main Card</h1>
        <div className="mt-1 text-xs text-[var(--ink-dim)]">
          {new Date(data.event.starts_at).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-red-500">LIVE ODDS · updates every 5s</span>
          </span>
        </div>
      </div>

      {ordered.length === 0 && (
        <div className="rounded-md border border-[var(--border)] p-6 text-center text-sm text-[var(--ink-dim)]">
          Odds haven't been pulled yet. Admin needs to run the sync.
        </div>
      )}

      <div className="space-y-4">
        {ordered.map((f) => (
          <FightCard key={f.id} fight={f} onPick={(market) => setBetCtx({ fight: f, market })} />
        ))}
      </div>

      {betCtx && <BetSlip ctx={betCtx} onClose={() => setBetCtx(null)} />}

      <PageFooter />
    </div>
  );
}

function FightCard({ fight, onPick }: { fight: Fight; onPick: (m: Market) => void }) {
  const [tab, setTab] = useState<"moneyline" | "method" | "round">("moneyline");
  const posLabel = fight.card_position === "main" ? "Main Event" : "Co-Main Event";
  const marketsByType = {
    moneyline: fight.markets.filter((m) => m.market_type === "moneyline"),
    method: fight.markets.filter((m) => m.market_type === "method"),
    round: fight.markets.filter((m) => m.market_type === "round"),
  };
  const updated = fight.markets[0]?.updated_at;
  const secondsAgo = updated ? Math.max(0, Math.round((Date.now() - new Date(updated).getTime()) / 1000)) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">{posLabel}</div>
          <div className="text-sm font-bold">
            {fight.fighter_a} <span className="text-[var(--ink-dim)]">vs</span> {fight.fighter_b}
          </div>
        </div>
        <div className="text-right text-[10px] text-[var(--ink-dim)]">
          {fight.scheduled_rounds} rds
          {secondsAgo != null && <div>{secondsAgo}s ago</div>}
        </div>
      </div>

      <div className="flex border-b border-[var(--border)] text-xs">
        {(["moneyline", "method", "round"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 font-semibold uppercase tracking-wide transition ${
              tab === t ? "bg-[var(--surface-3)] text-[var(--ink)]" : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            {t === "moneyline" ? "Moneyline" : t === "method" ? "Method" : "Round"}
          </button>
        ))}
      </div>

      <div className="p-3">
        {marketsByType[tab].length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--ink-dim)]">No {tab} odds available yet.</div>
        ) : (
          <div className={tab === "moneyline" ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
            {marketsByType[tab].map((m) => (
              <button
                key={m.selection_key}
                disabled={!m.is_active || fight.status === "finished"}
                onClick={() => onPick(m)}
                className="flex flex-col items-start rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)] disabled:opacity-50"
              >
                <span className="line-clamp-2 text-xs font-medium text-[var(--ink)]">{m.label}</span>
                <span className="mt-1 font-mono text-base font-bold text-[var(--accent)]">
                  {m.odds.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BetSlip({ ctx, onClose }: { ctx: { fight: Fight; market: Market }; onClose: () => void }) {
  const qc = useQueryClient();
  const placeFn = useServerFn(placeUfcBet);
  const [stake, setStake] = useState<string>("10");
  const stakeNum = Number(stake) || 0;
  const potential = stakeNum * ctx.market.odds;
  const payout = useCountUp(potential);

  const mutation = useMutation({
    mutationFn: (v: { stake: number }) =>
      placeFn({
        data: {
          fightId: ctx.fight.id,
          marketType: ctx.market.market_type,
          selectionKey: ctx.market.selection_key,
          stake: v.stake,
        },
      }),
    onSuccess: () => {
      toast.success("Bet placed");
      qc.invalidateQueries({ queryKey: ["ufc-fights"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to place bet"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface-1)] p-4 text-[var(--ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
              {ctx.market.market_type}
            </div>
            <div className="text-sm font-bold">{ctx.market.label}</div>
            <div className="text-xs text-[var(--ink-dim)]">
              {ctx.fight.fighter_a} vs {ctx.fight.fighter_b}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--ink-dim)] hover:text-[var(--ink)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-[var(--ink-dim)]">Odds</span>
          <span className="font-mono text-lg font-bold text-[var(--accent)]">{ctx.market.odds.toFixed(2)}</span>
        </div>

        <label className="block text-xs font-medium text-[var(--ink-dim)]">Stake</label>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-lg text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
        />

        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs text-[var(--ink-dim)]">Potential payout</span>
          <span className="font-mono text-xl font-bold text-[var(--ink)]">${payout.toFixed(2)}</span>
        </div>

        <button
          disabled={mutation.isPending || stakeNum <= 0}
          onClick={() => mutation.mutate({ stake: stakeNum })}
          className="mt-4 w-full rounded-md bg-[var(--accent)] px-4 py-3 font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? "Placing…" : "Confirm bet"}
        </button>
      </div>
    </div>
  );
}
