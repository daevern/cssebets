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
                "group relative aspect-square select-none rounded-xl transition-all duration-150",
                mine === "TRAP" ? "z-10 overflow-visible" : "overflow-hidden [contain:paint]",
                "grid place-items-center active:scale-[0.94]",
                !isOpen && !disabled && "hover:brightness-125",
                pending && "animate-pulse",
              )}
              style={{
                background: mine
                  ? mine === "SAFE"
                    ? "linear-gradient(180deg, #ff5ea8 0%, #b4247a 100%)"
                    : "radial-gradient(70% 70% at 50% 50%, #3a0d12 0%, #1a0509 100%)"
                  : exposed
                    ? "linear-gradient(180deg, #4a1f2c 0%, #2a0f18 100%)"
                    : "linear-gradient(180deg, #9c53f0 0%, #5a1fb0 55%, #3d128a 100%)",
                boxShadow: mine
                  ? mine === "SAFE"
                    ? "0 0 22px -4px rgba(255,94,168,0.9), inset 0 1px 0 rgba(255,255,255,0.4)"
                    : "0 0 34px -6px rgba(255,26,58,0.85), inset 0 0 14px rgba(0,0,0,0.7)"
                    : "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.35)",
                opacity: exposed ? 0.65 : 1,
                animation: mine === "TRAP" ? "tshake 420ms ease-in-out" : undefined,
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
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  {/* smoke / scorch cloud puffing out beyond the tile */}
                  <span
                    className="absolute -inset-[22%]"
                    style={{
                      background:
                        "radial-gradient(circle at 32% 38%, rgba(40,12,18,0.95) 0 18%, rgba(40,12,18,0) 42%)," +
                        "radial-gradient(circle at 70% 30%, rgba(52,16,24,0.9) 0 16%, rgba(52,16,24,0) 40%)," +
                        "radial-gradient(circle at 28% 72%, rgba(46,14,20,0.9) 0 17%, rgba(46,14,20,0) 42%)," +
                        "radial-gradient(circle at 74% 70%, rgba(38,10,16,0.92) 0 18%, rgba(38,10,16,0) 44%)," +
                        "radial-gradient(circle at 50% 50%, rgba(30,8,12,0.9) 0 30%, rgba(30,8,12,0) 62%)",
                      filter: "blur(1.5px)",
                      animation: "tsmoke 620ms cubic-bezier(0.18,0.9,0.3,1) forwards",
                    }}
                  />
                  {/* shockwave ring */}
                  <span
                    className="absolute inset-0 rounded-full border-2"
                    style={{
                      borderColor: "rgba(255,120,120,0.8)",
                      animation: "tring 520ms ease-out forwards",
                    }}
                  />
                  {/* white-hot flash */}
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0 18%, rgba(255,90,77,0.6) 38%, rgba(255,60,60,0) 70%)",
                      animation: "tflash 460ms ease-out forwards",
                    }}
                  />
                  {/* glowing red core orb */}
                  <span
                    className="relative h-[62%] w-[62%] rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 42% 36%, #ff8f8f 0 12%, #ff1a3a 45%, #b70020 100%)",
                      boxShadow:
                        "0 0 26px 6px rgba(255,26,58,0.75), inset 0 0 12px rgba(255,255,255,0.45)",
                      animation: "torb 420ms cubic-bezier(0.34,1.56,0.64,1) forwards",
                    }}
                  />
                  {/* white starburst rays over the core */}
                  <span
                    className="absolute h-[62%] w-[62%]"
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(255,255,255,0.95) 0 2deg, rgba(255,255,255,0) 2deg 43deg," +
                        "rgba(255,255,255,0.9) 43deg 46deg, rgba(255,255,255,0) 46deg 88deg," +
                        "rgba(255,255,255,0.95) 88deg 91deg, rgba(255,255,255,0) 91deg 133deg," +
                        "rgba(255,255,255,0.9) 133deg 136deg, rgba(255,255,255,0) 136deg 178deg," +
                        "rgba(255,255,255,0.95) 178deg 181deg, rgba(255,255,255,0) 181deg 223deg," +
                        "rgba(255,255,255,0.9) 223deg 226deg, rgba(255,255,255,0) 226deg 268deg," +
                        "rgba(255,255,255,0.95) 268deg 271deg, rgba(255,255,255,0) 271deg 313deg," +
                        "rgba(255,255,255,0.9) 313deg 316deg, rgba(255,255,255,0) 316deg 360deg)",
                      WebkitMaskImage:
                        "radial-gradient(circle at 50% 50%, #000 0 12%, rgba(0,0,0,0.85) 40%, transparent 72%)",
                      maskImage:
                        "radial-gradient(circle at 50% 50%, #000 0 12%, rgba(0,0,0,0.85) 40%, transparent 72%)",
                      animation: "tstar 520ms ease-out forwards",
                    }}
                  />
                  {/* bright center pinpoint */}
                  <span
                    className="absolute h-[18%] w-[18%] rounded-full bg-white"
                    style={{
                      boxShadow: "0 0 14px 4px rgba(255,255,255,0.9)",
                      animation: "torb 380ms ease-out forwards",
                    }}
                  />
                </span>
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
