import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { placeFootballBet } from "../football.functions";
import type { FootballSelection } from "../types/football";

export function FootballBetSlip({
  eventId,
  marketId,
  selection,
  onClose,
}: {
  eventId: string;
  marketId: string;
  selection: FootballSelection;
  onClose: () => void;
}) {
  const [stake, setStake] = useState<number>(100);
  const [submitting, setSubmitting] = useState(false);
  const placeBet = useServerFn(placeFootballBet);
  const qc = useQueryClient();

  const payout = +(stake * selection.odds).toFixed(2);

  const submit = async () => {
    if (submitting) return;
    if (stake < 10) {
      toast.error("Minimum stake is 10 points");
      return;
    }
    setSubmitting(true);
    try {
      await placeBet({
        data: {
          eventId,
          marketId,
          selectionId: selection.id,
          stake,
          maxOdds: selection.odds,
          idempotencyKey: `${eventId}-${selection.id}-${Date.now()}`,
        },
      });
      toast.success(`Bet placed · potential payout ${payout.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["football-my-bets"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not place bet");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:right-4 md:bottom-4 md:w-96">
      <div className="rounded-t-2xl md:rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface)] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-[var(--ink-muted)]">{selection.displayName}</div>
            <div className="text-lg font-bold text-[var(--neon)]">{selection.odds.toFixed(2)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bet slip"
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-[var(--ink-muted)] mb-1">Stake (pts)</label>
        <input
          type="number"
          inputMode="numeric"
          min={10}
          max={50000}
          value={stake}
          onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
          className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--color-surface-border)] px-3 py-2 text-[var(--ink)] mb-2"
        />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[50, 100, 500, 1000].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStake(n)}
              className="rounded-lg bg-white/5 hover:bg-white/10 text-xs py-1.5 text-[var(--ink)]"
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-[var(--ink-muted)]">Potential payout</span>
          <span className="font-bold text-[var(--ink)] tabular-nums">{payout.toFixed(2)}</span>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="w-full rounded-lg bg-[var(--neon)] text-black font-bold py-3 disabled:opacity-50"
        >
          {submitting ? "Placing…" : "Confirm bet"}
        </button>
      </div>
    </div>
  );
}
