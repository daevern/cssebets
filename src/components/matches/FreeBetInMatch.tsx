import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Loader2, X } from "lucide-react";
import { listMyFreeBets, placeFreeBet } from "@/lib/freebets.functions";

type Outcome = "HOME" | "DRAW" | "AWAY";

// Compact banner + inline placement UI for using an available free bet on the
// 90-minute match result market. Rendered on the match analytics page above
// the general MarketTabs when the user has at least one available free bet
// and reference_odds for the match are present. Stake is fixed to the free
// bet's stake_amount and only H/D/A are selectable, matching business rules.
export function FreeBetInMatch({
  matchId,
  referenceOdds,
}: {
  matchId: string;
  referenceOdds: { home?: number; draw?: number; away?: number } | null | undefined;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyFreeBets);
  const placeFn = useServerFn(placeFreeBet);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const myFbs = useQuery({ queryKey: ["my-free-bets"], queryFn: () => listFn() });
  const available = useMemo(() => myFbs.data?.available ?? [], [myFbs.data]);
  const active = available[0] as { id: string; stake_amount: number } | undefined;

  const odds = useMemo(() => {
    if (!referenceOdds || !outcome) return null;
    const key = outcome === "HOME" ? "home" : outcome === "DRAW" ? "draw" : "away";
    const n = Number((referenceOdds as any)[key]);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }, [outcome, referenceOdds]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!active || !outcome || !odds) throw new Error("Select Home, Draw or Away.");
      return placeFn({
        data: {
          freeBetId: active.id,
          matchId,
          market: "result" as const,
          outcome,
          referenceOdds: odds,
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Free bet placed — profit only pays out on win.");
      setOpen(false);
      setOutcome(null);
      qc.invalidateQueries({ queryKey: ["my-free-bets"] });
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["my-match-pending-bets", matchId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!active) return null;

  const hasOdds =
    referenceOdds &&
    (Number(referenceOdds.home) >= 1 ||
      Number(referenceOdds.draw) >= 1 ||
      Number(referenceOdds.away) >= 1);
  if (!hasOdds) return null;

  const stake = Number(active.stake_amount);
  const profit = odds ? Math.round(stake * (odds - 1) * 100) / 100 : 0;

  return (
    <div className="rounded-none border border-[var(--color-neon)]/40 bg-[#050B08] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-none bg-[var(--color-neon)]/10 text-[var(--color-neon)]">
            <Gift className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
              Free bet available
            </div>
            <div className="text-[11px] text-[var(--color-ink-muted)]">
              {available.length} × {stake} pts · match result (1X2) only
            </div>
          </div>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-none border border-[var(--color-neon)] bg-[var(--color-neon)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-black"
          >
            Use here
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setOutcome(null);
            }}
            className="grid h-8 w-8 place-items-center rounded-none border border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
            aria-label="Cancel free bet"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {(["HOME", "DRAW", "AWAY"] as const).map((k) => {
              const key = k === "HOME" ? "home" : k === "DRAW" ? "draw" : "away";
              const o = Number((referenceOdds as any)?.[key] ?? 0);
              const selected = outcome === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!o || o < 1}
                  onClick={() => setOutcome(k)}
                  className={`rounded-none border px-2 py-2 text-center font-mono text-xs disabled:opacity-30 ${
                    selected
                      ? "border-[var(--color-neon)] bg-black text-[var(--color-neon)]"
                      : "border-[var(--color-surface-border)] bg-black text-[var(--color-ink)]"
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
                    {k === "HOME" ? "Home" : k === "DRAW" ? "Draw" : "Away"}
                  </div>
                  <div className="mt-0.5">{o ? o.toFixed(2) : "—"}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-none border border-dashed border-[var(--color-surface-border)] bg-black/40 px-3 py-2 text-[11px]">
            <div className="text-[var(--color-ink-muted)]">
              Stake <span className="font-mono text-[var(--color-ink)]">{stake} pts</span>{" "}
              <span className="text-[9px] uppercase tracking-widest">(fixed)</span>
            </div>
            <div className="text-[var(--color-ink-muted)]">
              Wins pay{" "}
              <span className="font-mono text-[var(--color-neon)]">
                {profit > 0 ? `+${profit}` : "—"}
              </span>{" "}
              pts profit
            </div>
          </div>

          <button
            type="button"
            disabled={!outcome || !odds || mut.isPending}
            onClick={() => mut.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-none bg-[var(--color-neon)] px-3 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-black disabled:opacity-40"
          >
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Place free bet
          </button>

          <p className="text-[10px] leading-snug text-[var(--color-ink-muted)]">
            Free bets are funded by the house. On a win you receive the profit only —
            the stake stays with the platform. On a loss nothing is deducted from your
            wallet.
          </p>
        </div>
      )}
    </div>
  );
}
