import { lazy, Suspense, useMemo, useState } from "react";
import type { FootballMarket, FootballSelection } from "../types/football";

const OddsHistoryGraph = lazy(() => import("./OddsHistoryGraph"));

export function FootballMarketCard({
  market,
  onSelect,
  selectedSelectionId,
}: {
  market: FootballMarket;
  onSelect: (marketId: string, selection: FootballSelection) => void;
  selectedSelectionId?: string | null;
}) {
  const disabled = market.status !== "open";
  const [showHistory, setShowHistory] = useState(false);

  const selectionLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of market.selections) map[s.key] = s.displayName;
    return map;
  }, [market.selections]);

  return (
    <div className="rounded-xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--ink)]">
            {market.displayName}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
            {market.category} ·{" "}
            {market.period === "full"
              ? "Full time"
              : market.period === "1h"
                ? "1st half"
                : market.period}
          </div>
        </div>
        {market.status !== "open" ? (
          <span className="shrink-0 rounded bg-white/10 text-[var(--ink-muted)] text-[10px] font-bold px-2 py-0.5 uppercase">
            {market.status}
          </span>
        ) : null}
      </div>
      <div
        className={`grid gap-2 ${
          market.selections.length === 2
            ? "grid-cols-2"
            : market.selections.length >= 3
              ? "grid-cols-3"
              : "grid-cols-1"
        }`}
      >
        {market.selections.map((s) => {
          const isSelected = selectedSelectionId === s.id;
          const selDisabled = disabled || s.status !== "open";
          return (
            <button
              key={s.id}
              type="button"
              disabled={selDisabled}
              onClick={() => onSelect(market.id, s)}
              className={`min-h-11 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-[var(--neon)] bg-[var(--neon)]/10"
                  : "border-[var(--color-surface-border)]/70 bg-[var(--surface)]/40 hover:border-[var(--neon)]/40 active:bg-white/5"
              } ${selDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="text-[11px] text-[var(--ink-muted)] truncate">
                {s.displayName}
              </div>
              <div className="text-base font-bold tabular-nums text-[var(--ink)]">
                {s.odds.toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--neon)] underline-offset-2 hover:underline"
          aria-expanded={showHistory}
        >
          {showHistory ? "Hide price history" : "Show price history"}
        </button>
      </div>

      {showHistory ? (
        <Suspense
          fallback={
            <div className="mt-3 h-24 rounded-lg bg-white/[0.03] animate-pulse" />
          }
        >
          <OddsHistoryGraph
            marketId={market.id}
            selectionLabels={selectionLabels}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
