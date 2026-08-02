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
              "group relative aspect-square select-none rounded-[4px] transition-colors duration-150",
              "grid place-items-center",
              !isOpen && "bg-[var(--color-surface-2)]",
              !isOpen && !disabled && "hover:bg-[var(--color-surface-2)]/60",
              mine === "SAFE" && "bg-[var(--color-neon)]/20",
              mine === "TRAP" && "bg-destructive/25",
              exposed && "bg-destructive/10 opacity-60",
              pending && "animate-pulse bg-[var(--color-surface-2)]/70",
              disabled && !isOpen && "opacity-60",
            )}
          >
            {mine === "SAFE" && <Gem className="h-[42%] w-[42%] text-[var(--color-neon)]" />}
            {(mine === "TRAP" || exposed) && (
              <Bomb className={cn("h-[42%] w-[42%] text-destructive", exposed && "opacity-60")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export const TreasureGrid = memo(TreasureGridImpl);
