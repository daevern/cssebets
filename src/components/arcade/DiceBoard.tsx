import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
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
        const n = Math.random() * 99.99;
        setDisplay(n.toFixed(2));
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
 * Dice playfield: precision roll machine with dial, instrument track, and odds.
 * Presentation only — the landed value is always the server roll.
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
  /** 0→1 slide of the result marker after the roll is known. */
  markerProgress?: number;
}) {
  const chance = diceWinChance(target, direction) * 100;
  const mult = diceMultiplier(target, direction);
  const won = roll == null || rolling ? null : direction === "under" ? roll < target : roll >= target;
  const readout = useScramble(rolling, rolling ? null : roll);
  const markerLeft = roll == null ? target : roll * markerProgress + target * (1 - markerProgress);

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-3 px-3 py-2">
      {/* machine chassis */}
      <div
        className="relative w-full overflow-hidden rounded-[14px] border"
        style={{
          background: T.feltOrBoardFill,
          borderColor: T.railColor,
          boxShadow: `inset 0 0 0 1px ${T.rimMetal}40`,
        }}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ borderColor: T.hud.plaqueBorder, background: "rgba(0,0,0,.28)" }}
        >
          <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Roll machine
          </span>
          <span className="font-display text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: T.accent }}>
            0.00 — 99.99
          </span>
        </div>

        {/* dial */}
        <div className="relative px-3 pb-2 pt-4">
          <div
            className={cn(
              "relative mx-auto grid h-[108px] w-full max-w-[280px] place-items-center rounded-[12px] border",
              rolling && "motion-safe:animate-pulse",
            )}
            style={{
              background: "#04120c",
              borderColor:
                won == null ? `${T.rimMetal}66` : won ? T.accent : "rgba(255,120,120,.55)",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,.04), inset 0 -3px 0 rgba(0,0,0,.35)",
            }}
          >
            {/* tick bezel */}
            <div
              className="pointer-events-none absolute inset-x-3 top-2 flex justify-between"
              aria-hidden
            >
              {Array.from({ length: 11 }).map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-px"
                  style={{ background: i % 5 === 0 ? T.accent : "rgba(255,255,255,.18)" }}
                />
              ))}
            </div>
            <div
              className="font-display text-[44px] font-black tabular-nums leading-none tracking-tight"
              style={{
                color:
                  roll == null && !rolling
                    ? "var(--color-ink-muted)"
                    : won === false
                      ? "#ff8a8a"
                      : T.accent,
                textShadow: won ? `0 0 0 ${T.accent}` : undefined,
              }}
            >
              {readout}
            </div>
            <div className="absolute bottom-2 left-0 right-0 text-center text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              {rolling ? "Rolling" : won == null ? "Awaiting roll" : won ? "In band" : "Outside"}
            </div>
          </div>
        </div>

        {/* precision track */}
        <div className="px-3 pb-4 pt-1">
          <div
            className="relative h-7 w-full overflow-hidden rounded-[8px] border"
            style={{ background: "rgba(0,0,0,.55)", borderColor: T.hud.plaqueBorder }}
          >
            {/* win band */}
            <div
              className="absolute inset-y-0 transition-[left,width] duration-200"
              style={{
                left: direction === "under" ? 0 : `${target}%`,
                width: direction === "under" ? `${target}%` : `${100 - target}%`,
                background: T.accent,
                opacity: 0.38,
              }}
            />
            {/* fine ticks */}
            <div className="pointer-events-none absolute inset-0 flex items-stretch justify-between px-0">
              {Array.from({ length: 21 }).map((_, i) => (
                <span
                  key={i}
                  className="w-px self-end"
                  style={{
                    height: i % 5 === 0 ? "100%" : "45%",
                    background: "rgba(255,255,255,.12)",
                  }}
                />
              ))}
            </div>
            {/* target handle */}
            <div
              className="absolute top-0 z-10 flex h-full -translate-x-1/2 flex-col items-center"
              style={{ left: `${target}%` }}
            >
              <div className="h-full w-[3px]" style={{ background: T.accent }} />
              <div
                className="absolute -bottom-1 h-2.5 w-2.5 rotate-45 border"
                style={{ background: T.accent, borderColor: T.rimMetal }}
              />
            </div>
            {/* result marker */}
            {roll != null && !rolling && (
              <div
                className="absolute top-0 z-20 h-full -translate-x-1/2 transition-none"
                style={{ left: `${Math.min(100, Math.max(0, markerLeft))}%` }}
              >
                <div
                  className="h-full w-[2px]"
                  style={{ background: won ? "#ffffff" : "#ff8a8a" }}
                />
                <div
                  className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2"
                  style={{
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `7px solid ${won ? "#ffffff" : "#ff8a8a"}`,
                  }}
                />
              </div>
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] font-bold tabular-nums text-[var(--color-ink-muted)]">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* instrument plaques */}
      <div className="grid w-full grid-cols-3 gap-2">
        {[
          {
            label: "Target",
            value: `${direction === "under" ? "<" : "≥"} ${target.toFixed(0)}`,
            tone: T.accent,
          },
          {
            label: "Win chance",
            value: `${chance.toFixed(2)}%`,
            tone: "var(--color-ink)",
          },
          {
            label: "Payout",
            value: `${mult.toFixed(2)}×`,
            tone: T.accent,
          },
        ].map((p) => (
          <div
            key={p.label}
            className="rounded-[10px] border px-2 py-2 text-center"
            style={{ background: T.hud.plaqueBg, borderColor: T.hud.plaqueBorder }}
          >
            <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              {p.label}
            </div>
            <div
              className="mt-0.5 font-display text-[15px] font-black tabular-nums"
              style={{ color: p.tone }}
            >
              {p.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
