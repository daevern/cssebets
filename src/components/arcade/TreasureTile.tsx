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
 * A single arcade-button style tile. Purely presentational — the state is
 * always supplied by the authoritative server result.
 */
function TreasureTileImpl({ index, state, pending, disabled, onClick }: TreasureTileProps) {
  const isOpen = state !== "hidden";
  const label =
    state === "safe"
      ? `Tile ${index + 1}: treasure`
      : state === "trap" || state === "exposed"
        ? `Tile ${index + 1}: trap`
        : `Tile ${index + 1}: hidden`;

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={label}
      aria-disabled={disabled || isOpen || pending}
      disabled={disabled || isOpen || pending}
      onClick={onClick}
      className={cn(
        "group relative aspect-square min-h-[44px] select-none overflow-hidden rounded-[13px]",
        "grid place-items-center transition-[filter,transform] duration-150",
        !isOpen && !disabled && "hover:brightness-110 active:translate-y-[2px]",
        pending && "animate-pulse",
        disabled && !isOpen && "opacity-90",
      )}
      style={{
        background:
          state === "safe"
            ? "linear-gradient(180deg,#7b23c9 0%,#4b1090 100%)"
            : state === "trap"
              ? "linear-gradient(180deg,#5a1230 0%,#2a0718 100%)"
              : state === "exposed"
                ? "linear-gradient(180deg,#3a1436 0%,#200a20 100%)"
                : "linear-gradient(180deg,#8b45e0 0%,#5a1fb0 55%,#3d1289 100%)",
        boxShadow:
          state === "safe"
            ? "inset 0 0 0 1px rgba(255,120,240,.75), 0 0 18px -4px rgba(255,47,220,.8)"
            : state === "trap"
              ? "inset 0 0 0 1px rgba(255,90,120,.55), 0 0 16px -6px rgba(255,60,90,.7)"
              : "inset 0 1px 0 rgba(255,255,255,.28), inset 0 -3px 6px rgba(0,0,0,.42), inset 0 0 0 1px rgba(186,120,255,.35)",
        animation: state === "trap" ? "ttileShake 180ms ease-in-out" : undefined,
      }}
    >
      {/* top-left gloss */}
      {!isOpen && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-0.5 h-1/3 rounded-t-[10px]"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,0))",
          }}
        />
      )}

      {/* slow specular crawl across sealed vault stone */}
      {state === "hidden" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.22) 50%, rgba(255,255,255,0) 100%)",
            animation: `arcadeSpecularCrawl 5.2s ${(index % 5) * 0.4}s ease-in-out infinite`,
          }}
        />
      )}

      {(state === "hidden" || state === "exposed") && (
        <TreasureBombIcon className="h-[52%] w-[52%] opacity-90" bright={state === "exposed"} />
      )}

      {state === "safe" && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,120,240,.65), rgba(255,120,240,0) 68%)",
              animation: "tglowBurst 460ms ease-out forwards",
            }}
          />
          <TreasureGem className="relative h-[56%] w-[56%]" animate />
        </>
      )}

      {state === "trap" && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[13px] border"
            style={{
              borderColor: "rgba(255,110,140,.85)",
              animation: "ttileRing 420ms ease-out forwards",
            }}
          />
          <TreasureBombIcon className="relative h-[56%] w-[56%]" bright />
        </>
      )}
    </button>
  );
}

export const TreasureTile = memo(TreasureTileImpl);
