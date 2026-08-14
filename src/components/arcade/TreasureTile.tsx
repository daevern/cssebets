import { memo } from "react";
import { cn } from "@/lib/utils";
import { TreasureGem } from "./TreasureGem";
import { TreasureBombIcon } from "./TreasureBombIcon";

export type TreasureTileState = "hidden" | "safe" | "trap" | "exposed";

export type TreasureTileProps = {
  index: number;
  state: TreasureTileState;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

/**
 * Flat 2D tile — solid fills, no gloss / specular crawl / glow bursts.
 */
function TreasureTileImpl({ index, state, pending, disabled, onClick }: TreasureTileProps) {
  const isOpen = state !== "hidden";
  const label =
    state === "safe"
      ? `Tile ${index + 1}: treasure`
      : state === "trap" || state === "exposed"
        ? `Tile ${index + 1}: trap`
        : `Tile ${index + 1}: hidden`;

  const fill =
    state === "safe"
      ? "#0e2b17"
      : state === "trap"
        ? "#3a1620"
        : state === "exposed"
          ? "#1b2b34"
          : "#2f4553";

  const border =
    state === "safe"
      ? "rgba(0,231,1,.65)"
      : state === "trap"
        ? "rgba(255,90,110,.6)"
        : "rgba(255,255,255,.08)";

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={label}
      aria-disabled={disabled || isOpen || pending}
      disabled={disabled || isOpen || pending}
      onClick={onClick}
      className={cn(
        "group relative aspect-square min-h-[44px] select-none overflow-hidden rounded-[6px]",
        "grid place-items-center transition-opacity duration-150",
        !isOpen && !disabled && "hover:opacity-90 active:opacity-80",
        pending && "animate-pulse",
        disabled && !isOpen && "opacity-90",
      )}
      style={{
        background: fill,
        boxShadow: `inset 0 0 0 1px ${border}`,
      }}
    >
      {(state === "hidden" || state === "exposed") && (
        <TreasureBombIcon className="h-[52%] w-[52%] opacity-90" bright={state === "exposed"} />
      )}

      {state === "safe" && <TreasureGem className="relative h-[56%] w-[56%]" animate={false} />}

      {state === "trap" && <TreasureBombIcon className="relative h-[56%] w-[56%]" bright />}
    </button>
  );
}

export const TreasureTile = memo(TreasureTileImpl);
