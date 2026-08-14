import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
import { diceMultiplier, diceWinChance, type DiceDirection } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.dice;

/** Presentation scramble while waiting / landing — never invents the final roll. */
function useScramble(rolling: boolean, final: number | null) {
  const [display, setDisplay] = useState<string>("00.00");
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (!rolling && final == null) {
      setDisplay("00.00");
      return;
    }
    if (!rolling && final != null) {
      setDisplay(final.toFixed(2));
      return;
    }
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 40) {
        last = t;
        setDisplay((Math.random() * 99.99).toFixed(2));
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [rolling, final]);

  return display;
}

/**
 * Dice playfield — one green composition: dial, win band, land marker.
 * Odds live in the dock; no plaque strip on the table.
 */
export function DiceBoard({
  target,
  direction,
  roll,
  rolling,
  markerProgress = 1,
}: {
  target: number;
  direction: DiceDirection;
  roll: number | null;
  rolling: boolean;
  markerProgress?: number;
}) {
  const chance = diceWinChance(target, direction) * 100;
  const mult = diceMultiplier(target, direction);
  const won = roll == null || rolling ? null : direction === "under" ? roll < target : roll >= target;
  const readout = useScramble(rolling, rolling ? null : roll);
  const markerLeft = roll == null ? target : roll * markerProgress + target * (1 - markerProgress);

  return (
    <div
      className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[12px]"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="pointer-events-none absolute left-1/2 top-[38%] z-0 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 opacity-[0.16]">
        <div className="grid h-12 w-12 place-items-center rounded-full border border-white/30">
          <CsseMark variant="mono" className="h-7 w-7 text-white" />
        </div>
        <CsseWordmark
          size={11}
          className="[&_span]:[color:transparent!important] [&_span]:[-webkit-text-stroke:0.6px_rgba(255,255,255,0.55)!important]"
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 px-4 pb-5 pt-5">
        {/* dial */}
        <div
          className={cn(
            "relative grid h-[120px] w-full max-w-[260px] place-items-center rounded-[14px] border",
            rolling && "motion-safe:animate-pulse",
          )}
          style={{
            background: "#04120c",
            borderColor:
              won == null ? "rgba(255,255,255,.1)" : won ? T.accent : "rgba(255,120,120,.5)",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,.04), inset 0 -3px 0 rgba(0,0,0,.35)",
          }}
        >
          <div
            className="font-display text-[48px] font-black tabular-nums leading-none tracking-tight"
            style={{
              color:
                roll == null && !rolling
                  ? "rgba(255,255,255,.28)"
                  : won === false
                    ? "#ff8a8a"
                    : T.accent,
            }}
          >
            {readout}
          </div>
        </div>

        {/* track — the instrument */}
        <div className="w-full">
          <div
            className="relative h-6 w-full overflow-hidden rounded-full border"
            style={{ background: "rgba(0,0,0,.5)", borderColor: "rgba(255,255,255,.1)" }}
          >
            <div
              className="absolute inset-y-0 transition-[left,width] duration-200"
              style={{
                left: direction === "under" ? 0 : `${target}%`,
                width: direction === "under" ? `${target}%` : `${100 - target}%`,
                background: T.accent,
                opacity: 0.42,
              }}
            />
            <div
              className="absolute top-0 z-10 h-full w-[2px] -translate-x-1/2"
              style={{ left: `${target}%`, background: T.accent }}
            />
            {roll != null && !rolling && (
              <div
                className="absolute top-0 z-20 h-full w-[2px] -translate-x-1/2"
                style={{
                  left: `${Math.min(100, Math.max(0, markerLeft))}%`,
                  background: won ? "#ffffff" : "#ff8a8a",
                }}
              />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between px-0.5">
            <span className="font-display text-[11px] font-black tabular-nums" style={{ color: T.accent }}>
              {direction === "under" ? "<" : "≥"} {target}
            </span>
            <span className="text-[10px] font-bold tabular-nums text-white/45">
              {chance.toFixed(1)}% · {mult.toFixed(2)}×
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
