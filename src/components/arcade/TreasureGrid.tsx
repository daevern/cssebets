import { memo } from "react";
import { cn } from "@/lib/utils";
import { TreasureTile, type TreasureTileState } from "./TreasureTile";
export type TreasureDifficulty = "easy" | "medium" | "hard";

export type TreasureGridProps = {
  rows: number;
  cols: number;
  /** index -> revealed type for tiles the player opened */
  opened: Record<number, "SAFE" | "TRAP">;
  /** full trap map, only ever supplied after the round settles */
  traps?: number[] | null;
  /** tile currently awaiting the server */
  pendingIndex?: number | null;
  disabled?: boolean;
  onReveal: (index: number) => void;
  /** overlay pill shown before a round starts */
  message?: string | null;
  /** selected difficulty */
  difficulty?: TreasureDifficulty;
  /** difficulty options to display below the title */
  difficultyOptions?: { key: string; label: string }[];
  /** called when a difficulty option is selected */
  onDifficultyChange?: (key: TreasureDifficulty) => void;
};

/**
 * 5x5 (configurable) Treasure Grid board.
 * Purely presentational — every outcome comes from the server.
 */
function TreasureGridImpl({
  rows,
  cols,
  opened,
  traps,
  pendingIndex,
  disabled,
  onReveal,
  message,
  difficulty,
  difficultyOptions,
  onDifficultyChange,
}: TreasureGridProps) {
  const total = rows * cols;
  const trapSet = traps ? new Set(traps) : null;
  const showDifficulty = difficultyOptions && difficultyOptions.length > 0 && difficulty !== undefined;

  return (
    <div
      className="treasure-stage relative mx-auto w-full max-w-[min(100%,1080px)] overflow-hidden rounded-[12px] p-2 sm:p-3 max-md:rounded-none"
      style={{
        background: "#213743",
        border: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <style>{`
        .treasure-stage {
          --treasure-bg: #213743;
          --treasure-bg-2: #0f212e;
          --treasure-glow: transparent;
          --treasure-border: rgba(255,255,255,.08);
          --treasure-magenta: #00e701;
        }
        @media (prefers-reduced-motion: reduce) {
          .treasure-stage *, .treasure-stage *::before, .treasure-stage *::after {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      {showDifficulty && (
        <div
          role="tablist"
          aria-label="Difficulty"
          className="relative z-10 mx-auto mb-2 flex w-fit max-w-full items-center gap-1 rounded-[8px] border border-white/8 bg-[#0f212e] p-1"
        >
          {difficultyOptions.map((o) => {
            const active = o.key === difficulty;
            return (
              <button
                key={o.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onDifficultyChange?.(o.key as TreasureDifficulty)}
                className={cn(
                  "h-8 min-w-[72px] rounded-[6px] px-3 text-[10px] font-bold uppercase tracking-[0.04em] transition-colors",
                  active
                    ? "bg-[#00e701] text-[#03210a]"
                    : "text-white/55 hover:bg-white/5 hover:text-white",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="relative grid w-full gap-1.5 sm:gap-2.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Treasure grid"
      >
        {Array.from({ length: total }, (_, i) => {
          const mine = opened[i];
          const exposed = !mine && trapSet?.has(i);
          const state: TreasureTileState = mine
            ? mine === "SAFE"
              ? "safe"
              : "trap"
            : exposed
              ? "exposed"
              : "hidden";
          return (
            <TreasureTile
              key={i}
              index={i}
              state={state}
              pending={pendingIndex === i}
              disabled={disabled}
              onClick={() => onReveal(i)}
            />
          );
        })}

        {message && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-[8px] border border-white/10 bg-[#0f212e]/95 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
              {message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const TreasureGrid = memo(TreasureGridImpl);
