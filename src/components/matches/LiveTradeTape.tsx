// LiveTradeTape — Kalshi-style vertical trade ticker.
// Small `+ $amount` labels stacked and scrolling upward, looping forever.
// Purely visual: pointer-events-none, no impact on chart data or odds.
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const OUTCOME_COLORS: Record<string, string> = {
  home: "#22C55E",
  draw: "#3B82F6",
  away: "#EC4899",
};

export type LiveTradeInput =
  | number
  | { amount: number; outcome?: "home" | "draw" | "away" | string };

export type LiveTradeTapeProps = {
  trades: LiveTradeInput[];
  outcomeType?: "home" | "draw" | "away";
  className?: string;
};

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(Math.round(n / 100) / 10).toString()}k`;
  return String(Math.round(n));
}

function colorFor(outcome: string | undefined, fallback: string): string {
  if (!outcome) return fallback;
  return OUTCOME_COLORS[outcome.toLowerCase()] ?? fallback;
}

export function LiveTradeTape({ trades, outcomeType, className }: LiveTradeTapeProps) {
  const defaultColor = outcomeType ? OUTCOME_COLORS[outcomeType] : "#22C55E";

  const normalized = useMemo(() => {
    const list = (trades ?? [])
      .map((t) =>
        typeof t === "number"
          ? { amount: t, color: defaultColor }
          : { amount: Number(t.amount) || 0, color: colorFor(t.outcome, defaultColor) },
      )
      .filter((t) => t.amount > 0);
    if (list.length === 0) return [];
    // Ensure at least 8 items so the loop always fills the column.
    const filled: typeof list = [];
    let i = 0;
    while (filled.length < 8) {
      filled.push(list[i % list.length]);
      i += 1;
    }
    return filled;
  }, [trades, defaultColor]);

  if (normalized.length === 0) return null;

  // Duration scales with count so the visual speed stays consistent.
  const durationSec = Math.min(14, Math.max(8, normalized.length * 1.2));

  // Duplicate the sequence for seamless CSS loop.
  const loop = [...normalized, ...normalized];

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-2 left-3 top-1/3 z-10 w-14 overflow-hidden md:left-4",
        className,
      )}
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
      }}
      aria-hidden="true"
    >
      <div
        className="flex flex-col gap-2 will-change-transform"
        style={{ animation: `liveTradeTape ${durationSec}s linear infinite` }}
      >
        {loop.map((t, idx) => (
          <span
            key={idx}
            className="text-[13px] font-bold leading-none tabular-nums"
            style={{ color: t.color, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            + ${formatAmount(t.amount)}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes liveTradeTape {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  );
}
