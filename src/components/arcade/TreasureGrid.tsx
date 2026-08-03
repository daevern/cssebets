import { memo } from "react";
import { Gem, Bomb } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileState = "hidden" | "safe" | "trap" | "revealed-safe" | "revealed-trap";

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
}: TreasureGridProps) {
  const total = rows * cols;
  const trapSet = traps ? new Set(traps) : null;

  return (
    <div
      className="grid w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="Treasure grid"
    >
      {Array.from({ length: total }, (_, i) => {
        const mine = opened[i];
        const exposed = !mine && trapSet?.has(i);
        const pending = pendingIndex === i;
        const isOpen = Boolean(mine) || Boolean(exposed);

        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            aria-label={
              mine
                ? `Tile ${i + 1} ${mine === "SAFE" ? "treasure" : "trap"}`
                : `Tile ${i + 1} hidden`
            }
            disabled={disabled || isOpen || pending}
            onClick={() => onReveal(i)}
            className={cn(
              "group relative aspect-square select-none overflow-hidden rounded-[4px] transition-colors duration-150 [contain:paint]",
              "grid place-items-center",
              !isOpen && "bg-white/12",
              !isOpen && !disabled && "hover:bg-white/20",
              mine === "SAFE" && "bg-[var(--color-neon)]/30",
              mine === "TRAP" && "bg-destructive/40",
              exposed && "bg-destructive/15 opacity-60",
              pending && "animate-pulse bg-white/20",
              disabled && !isOpen && "opacity-70",
            )}
          >
            {mine === "SAFE" && (
              <>
                <span className="pointer-events-none absolute inset-0 rounded-[4px] bg-[var(--color-neon)]/40 will-change-[transform,opacity] animate-[treasure-flash_450ms_ease-out_forwards]" />
                <Gem className="relative h-[42%] w-[42%] text-[var(--color-neon)] will-change-transform animate-[treasure-pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]" />
              </>
            )}
            {mine === "TRAP" && (
              <>
                <span className="pointer-events-none absolute inset-0 rounded-[4px] bg-destructive/70 will-change-[transform,opacity] animate-[treasure-blast_520ms_ease-out_forwards]" />
                <Bomb className="relative h-[42%] w-[42%] text-destructive will-change-transform animate-[treasure-shake_420ms_ease-in-out]" />
              </>
            )}
            {exposed && <Bomb className="h-[42%] w-[42%] text-destructive opacity-60" />}
          </button>
        );
      })}
    </div>
  );
}

export const TreasureGrid = memo(TreasureGridImpl);
