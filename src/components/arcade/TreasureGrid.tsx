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
      className="relative overflow-hidden rounded-2xl p-2.5"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #4b1b8f 0%, #2c0f57 45%, #150726 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(198,120,255,0.35), 0 0 40px -12px rgba(168,85,247,0.65)",
      }}
    >
      <style>{`
        @keyframes tgem { 0%{transform:scale(.4);opacity:0} 60%{transform:scale(1.12);opacity:1} 100%{transform:scale(1)} }
        @keyframes tspark { 0%{opacity:.85;transform:scale(.5)} 100%{opacity:0;transform:scale(1.7)} }
        @keyframes tsmoke { 0%{opacity:0;transform:scale(.25) rotate(0deg)} 25%{opacity:.95} 100%{opacity:.55;transform:scale(1.25) rotate(22deg)} }
        @keyframes tflash { 0%{opacity:0;transform:scale(.2)} 12%{opacity:1;transform:scale(1.35)} 100%{opacity:0;transform:scale(1.9)} }
        @keyframes torb { 0%{opacity:0;transform:scale(.1)} 30%{opacity:1;transform:scale(1.18)} 55%{transform:scale(.94)} 100%{opacity:1;transform:scale(1)} }
        @keyframes tstar { 0%{opacity:0;transform:scale(.2) rotate(-25deg)} 35%{opacity:1;transform:scale(1.15) rotate(0deg)} 100%{opacity:.85;transform:scale(1) rotate(0deg)} }
        @keyframes tring { 0%{opacity:.9;transform:scale(.2)} 100%{opacity:0;transform:scale(2.1)} }
        @keyframes tshake { 0%,100%{transform:translate(0,0)} 15%{transform:translate(-2px,1px)} 30%{transform:translate(2px,-1px)} 45%{transform:translate(-2px,-1px)} 60%{transform:translate(2px,1px)} 80%{transform:translate(-1px,0)} }
      `}</style>

      <div
        className="grid w-full gap-1.5"
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
                "group relative aspect-square select-none overflow-hidden rounded-xl transition-all duration-150 [contain:paint]",
                "grid place-items-center active:scale-[0.94]",
                !isOpen && !disabled && "hover:brightness-125",
                pending && "animate-pulse",
              )}
              style={{
                background: mine
                  ? mine === "SAFE"
                    ? "linear-gradient(180deg, #ff5ea8 0%, #b4247a 100%)"
                    : "linear-gradient(180deg, #ff5a4d 0%, #8c1509 100%)"
                  : exposed
                    ? "linear-gradient(180deg, #4a1f2c 0%, #2a0f18 100%)"
                    : "linear-gradient(180deg, #9c53f0 0%, #5a1fb0 55%, #3d128a 100%)",
                boxShadow: mine
                  ? mine === "SAFE"
                    ? "0 0 22px -4px rgba(255,94,168,0.9), inset 0 1px 0 rgba(255,255,255,0.4)"
                    : "0 0 22px -4px rgba(255,90,77,0.8), inset 0 1px 0 rgba(255,255,255,0.25)"
                    : "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.35)",
                opacity: exposed ? 0.65 : 1,
              }}
            >
              {/* glossy top highlight */}
              {!isOpen && (
                <span
                  className="pointer-events-none absolute inset-x-1 top-0.5 h-1/3 rounded-t-lg"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))",
                  }}
                />
              )}
              {!isOpen && (
                <Bomb
                  className="h-[46%] w-[46%] text-black/45"
                  strokeWidth={1.6}
                  aria-hidden
                />
              )}

              {mine === "SAFE" && (
                <>
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.65), rgba(255,255,255,0) 65%)",
                      animation: "tspark 520ms ease-out forwards",
                    }}
                  />
                  <Gem
                    className="relative h-[48%] w-[48%] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                    style={{ animation: "tgem 320ms cubic-bezier(0.34,1.56,0.64,1)" }}
                  />
                </>
              )}
              {mine === "TRAP" && (
                <>
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 50%, rgba(255,200,120,0.85), rgba(255,90,77,0) 70%)",
                      animation: "tspark 560ms ease-out forwards",
                    }}
                  />
                  <Bomb className="relative h-[48%] w-[48%] text-white will-change-transform animate-[treasure-shake_420ms_ease-in-out]" />
                </>
              )}
              {exposed && <Bomb className="h-[42%] w-[42%] text-white/50" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const TreasureGrid = memo(TreasureGridImpl);
