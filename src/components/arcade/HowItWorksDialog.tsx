import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Info } from "lucide-react";
import type { RiskMode } from "./types";

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
}

export function HowItWorksDialog({
  rows,
  riskMode,
  slots,
  configVersion,
}: {
  rows: number;
  riskMode: RiskMode;
  slots: { slot_index: number; score: number; multiplier: number }[];
  configVersion?: number;
}) {
  const [open, setOpen] = useState(false);
  const totalOutcomes = Math.pow(2, rows);
  const table = useMemo(
    () =>
      slots.map((s) => ({
        slot: s.slot_index,
        multiplier: Number(s.multiplier ?? 0),
        p: binomial(rows, s.slot_index) / totalOutcomes,
      })),
    [rows, slots, totalOutcomes],
  );
  const rtp = useMemo(() => table.reduce((a, r) => a + r.p * r.multiplier, 0), [table]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full flex-col items-center gap-0.5 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-1 py-1.5 text-center text-[8px] font-bold uppercase leading-tight tracking-[0.12em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
        >
          <Info className="h-3 w-3" />
          How it works
        </button>

      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
            Game Transparency
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[12px] text-[var(--color-ink-muted)]">
          <p>
            Every drop is generated on the server using HMAC-SHA256 over a secret server seed, your
            client seed, and an incrementing nonce. Each peg makes an equal-probability left/right
            decision. The animation only visualises the server result — it cannot change your
            landing slot.
          </p>
          <p>
            <span className="font-bold text-[var(--color-ink)]">Risk mode:</span>{" "}
            {riskMode === "low" && "Low — consistent scores, small centre/outer spread."}
            {riskMode === "medium" && "Medium — balanced scores with rare outer wins."}
            {riskMode === "high" && "High — frequent zeros, rare large outer wins."}
          </p>
          <div className="max-h-72 overflow-auto border border-[var(--color-surface-border)]">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[var(--color-surface-2)] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                <tr>
                  <th className="p-2">Slot</th>
                  <th className="p-2">Probability</th>
                  <th className="p-2 text-right">Multiplier</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {table.map((r) => (
                  <tr key={r.slot} className="border-t border-[var(--color-surface-border)]">
                    <td className="p-2">{r.slot}</td>
                    <td className="p-2">{(r.p * 100).toFixed(3)}%</td>
                    <td className="p-2 text-right text-[var(--color-ink)]">
                      {r.multiplier.toFixed(r.multiplier >= 10 ? 1 : 2)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px]">
            <span className="font-bold text-[var(--color-ink)]">Theoretical RTP:</span>{" "}
            {(rtp * 100).toFixed(2)}%
          </p>
          {configVersion != null && (
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Active config v{configVersion}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
