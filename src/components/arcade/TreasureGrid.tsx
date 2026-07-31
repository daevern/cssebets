import { memo } from "react";
import { Gem, Bomb, HelpCircle } from "lucide-react";
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
      className="grid w-full gap-1.5 sm:gap-2"
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
              "group relative aspect-square select-none rounded-xl border transition-all duration-200",
              "grid place-items-center",
              !isOpen &&
                "border-[var(--color-surface-border)] bg-[var(--color-surface-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
              !isOpen &&
                !disabled &&
                "hover:-translate-y-[2px] hover:border-[var(--color-neon)]/60 active:translate-y-0",
              mine === "SAFE" &&
                "border-[var(--color-neon)] bg-[var(--color-neon)]/15 shadow-[0_0_18px_rgba(var(--neon-glow-rgb),0.35)]",
              mine === "TRAP" && "border-destructive bg-destructive/20",
              exposed && "border-destructive/40 bg-destructive/10 opacity-70",
              pending && "animate-pulse border-[var(--color-neon)]/70",
              disabled && !isOpen && "opacity-60",
            )}
          >
            {mine === "SAFE" && (
              <Gem className="h-[45%] w-[45%] text-[var(--color-neon)] drop-shadow-[0_0_6px_rgba(var(--neon-glow-rgb),0.7)]" />
            )}
            {(mine === "TRAP" || exposed) && (
              <Bomb className={cn("h-[45%] w-[45%] text-destructive", exposed && "opacity-60")} />
            )}
            {!isOpen && (
              <HelpCircle className="h-[32%] w-[32%] text-[var(--color-ink-muted)]/35 transition-colors group-hover:text-[var(--color-ink-muted)]/60" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export const TreasureGrid = memo(TreasureGridImpl);
