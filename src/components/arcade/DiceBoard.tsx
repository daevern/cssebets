import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { diceMultiplier, diceWinChance, type DiceDirection } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.dice;
const LOSS = "#ff4d5e";

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

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "loss";
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-[6px] border px-2.5 py-2"
      style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
    >
      <span className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span
        className="font-display text-[15px] font-black tabular-nums leading-none"
        style={{ color: tone === "accent" ? T.accent : tone === "loss" ? LOSS : "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Dice playfield — Stake-style slate console: floating result pill, split
 * win/lose rail, 0-100 ruler and live stat cells. Presentation only.
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
  const landed = roll != null && !rolling;
  const won = !landed ? null : direction === "under" ? roll! < target : roll! >= target;
  const readout = useScramble(rolling, rolling ? null : roll);
  const markerLeft = roll == null ? target : roll * markerProgress + target * (1 - markerProgress);
  const pillLeft = Math.min(93, Math.max(7, markerLeft));

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      {/* result pill rail */}
      <div className="relative h-[86px]">
        <div
          key={landed ? `${roll}-${markerProgress >= 1}` : "idle"}
          className={cn(
            "absolute top-3 -translate-x-1/2 rounded-[8px] border px-3 py-2 text-center",
            landed && markerProgress >= 1 && "motion-safe:[animation:dicePillLand_360ms_ease-out]",
          )}
          style={{
            left: `${pillLeft}%`,
            background: "#0f212e",
            borderColor: won == null ? "rgba(255,255,255,.12)" : won ? T.accent : LOSS,
            boxShadow:
              won == null
                ? "none"
                : `0 0 0 1px ${won ? "rgba(0,231,1,.25)" : "rgba(255,77,94,.25)"}`,
            transition: "left 120ms linear",
          }}
        >
          <div
            className="font-display text-[26px] font-black tabular-nums leading-none"
            style={{
              color: won == null ? "rgba(255,255,255,.55)" : won ? T.accent : LOSS,
            }}
          >
            {readout}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
            {rolling ? "rolling" : won == null ? "ready" : won ? "win" : "bust"}
          </div>
          <div
            className="absolute left-1/2 top-full h-2 w-[2px] -translate-x-1/2"
            style={{ background: won == null ? "rgba(255,255,255,.2)" : won ? T.accent : LOSS }}
          />
        </div>
      </div>

      {/* rail */}
      <div
        className={cn(
          "relative",
          landed && won === false && "motion-safe:[animation:diceTrackShock_260ms_ease-out]",
        )}
      >
        <div
          className="relative h-[18px] w-full overflow-hidden rounded-full"
          style={{ background: LOSS, boxShadow: "inset 0 2px 4px rgba(0,0,0,.45)" }}
        >
          <div
            className="absolute inset-y-0 transition-[left,width] duration-200"
            style={{
              left: direction === "under" ? 0 : `${target}%`,
              width: direction === "under" ? `${target}%` : `${100 - target}%`,
              background: T.accent,
            }}
          />
          {rolling && (
            <div
              className="absolute inset-y-0 w-1/3 motion-safe:[animation:diceBandSweep_900ms_linear_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)",
              }}
            />
          )}
          {/* thumb */}
          <div
            className="absolute top-1/2 z-20 h-[26px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] border transition-[left] duration-200"
            style={{
              left: `${target}%`,
              background: "#ffffff",
              borderColor: "rgba(0,0,0,.35)",
              boxShadow: "0 2px 6px rgba(0,0,0,.5)",
            }}
          />
          {landed && (
            <div
              className="absolute top-1/2 z-10 h-[26px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${Math.min(100, Math.max(0, markerLeft))}%`,
                background: "#ffffff",
              }}
            />
          )}
        </div>

        {/* ruler */}
        <div className="mt-1.5 flex justify-between px-[1px]">
          {[0, 25, 50, 75, 100].map((n) => (
            <span key={n} className="text-[9px] font-bold tabular-nums text-white/30">
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* stat cells */}
      <div className="mt-3 flex items-stretch gap-2">
        <StatCell label="Mult" value={`${mult.toFixed(4)}×`} tone="accent" />
        <StatCell
          label={direction === "under" ? "Under" : "Over"}
          value={target.toFixed(2)}
        />
        <StatCell label="Chance" value={`${chance.toFixed(2)}%`} />
      </div>
    </div>
  );
}
