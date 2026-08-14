import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { WHEEL_SEGMENTS, type WheelRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.wheel;
const SPIN_MS = 4200;
const GREY = "#2f4553";

/** Stake tier palette — grey for 0x, then grey-green → green → yellow → red. */
function colourFor(m: number): string {
  if (m <= 0) return GREY;
  if (m < 1) return "#00e701";
  if (m < 1.5) return "#d5ff4a";
  if (m < 2) return "#ffe83f";
  if (m < 4) return "#ff9d00";
  if (m < 10) return "#ff4d5e";
  return "#8a4bff";
}

/**
 * Fortune Wheel — Stake's wheel: a thin segmented ring on flat slate, a small
 * pointer at 12 o'clock, the landed multiplier in the hub, and a payout
 * legend rail beneath. Presentation only.
 */
export function WheelBoard({
  risk,
  landedIndex,
  spinKey,
  onSettled,
  onTick,
}: {
  risk: WheelRisk;
  landedIndex: number | null;
  spinKey: number;
  onSettled: () => void;
  onTick?: () => void;
}) {
  const segments = WHEEL_SEGMENTS[risk];
  const n = segments.length;
  const [angle, setAngle] = useState(0);
  const [settledIdx, setSettledIdx] = useState<number | null>(null);
  const [kick, setKick] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spinsRef = useRef(0);
  const angleRef = useRef(0);
  const lastSegRef = useRef(-1);
  const tickRaf = useRef<number | null>(null);

  useEffect(() => {
    if (landedIndex == null) return;
    setSettledIdx(null);
    setSpinning(true);
    spinsRef.current += 1;
    const segAngle = 360 / n;
    const target = 360 * 6 * spinsRef.current - (landedIndex * segAngle + segAngle / 2);
    const startAngle = angleRef.current;
    angleRef.current = target;
    setAngle(target);

    const t0 = performance.now();
    lastSegRef.current = -1;
    let lastTickAt = 0;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const loop = (now: number) => {
      const p = Math.min(1, (now - t0) / SPIN_MS);
      const cur = startAngle + (target - startAngle) * ease(p);
      const underPointer = ((-cur % 360) + 360) % 360;
      const seg = Math.floor(underPointer / segAngle) % n;
      if (seg !== lastSegRef.current) {
        lastSegRef.current = seg;
        setKick((k) => k + 1);
        if (p > 0.04 && p < 0.9 && now - lastTickAt > 90) {
          lastTickAt = now;
          onTick?.();
        }
      }
      if (p < 1) tickRaf.current = requestAnimationFrame(loop);
    };
    tickRaf.current = requestAnimationFrame(loop);

    const t = window.setTimeout(() => {
      setSettledIdx(landedIndex);
      setSpinning(false);
      onSettled();
    }, SPIN_MS);

    return () => {
      window.clearTimeout(t);
      if (tickRaf.current) cancelAnimationFrame(tickRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const C = 136;
  const R_OUT = 122;
  const R_IN = 92;
  const landedMult = settledIdx != null ? segments[settledIdx] : null;
  const won = landedMult != null ? landedMult >= 1 : null;

  /** Distinct multipliers, ascending — Stake's legend rail under the wheel. */
  const legend = useMemo(
    () => Array.from(new Set(segments)).sort((a, b) => a - b),
    [segments],
  );

  const arc = (i: number) => {
    const pad = 0.006; // hairline slate gap between segments
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + pad;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - pad;
    const pt = (a: number, r: number) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
    return `M${pt(a0, R_OUT)} A${R_OUT} ${R_OUT} 0 0 1 ${pt(a1, R_OUT)} L${pt(
      a1,
      R_IN,
    )} A${R_IN} ${R_IN} 0 0 0 ${pt(a0, R_IN)} Z`;
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-4"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="relative mx-auto w-[292px]">
        {/* pointer */}
        <div
          key={`kick-${kick}`}
          className={cn(
            "absolute left-1/2 top-[6px] z-30 -translate-x-1/2",
            spinning && "motion-safe:[animation:wheelPointerKick_140ms_ease-out]",
          )}
          aria-hidden
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "14px solid #ffffff",
              filter: "drop-shadow(0 2px 3px rgba(0,0,0,.55))",
            }}
          />
        </div>

        <svg
          viewBox="0 0 272 272"
          className="mx-auto h-[288px] w-[288px]"
          role="img"
          aria-label="Fortune wheel"
        >
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: `${C}px ${C}px`,
              transition: `transform ${SPIN_MS}ms cubic-bezier(.08,.7,.12,1)`,
            }}
          >
            {segments.map((m, i) => (
              <path
                key={i}
                d={arc(i)}
                fill={colourFor(m)}
                opacity={settledIdx != null && settledIdx !== i ? 0.55 : 1}
                style={{ transition: "opacity 220ms ease-out" }}
              />
            ))}
          </g>

          {/* hub readout */}
          <text
            x={C}
            y={C + 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={landedMult != null ? 40 : 20}
            fontWeight="900"
            fill={
              landedMult == null
                ? "rgba(255,255,255,.28)"
                : won
                  ? colourFor(landedMult)
                  : "rgba(255,255,255,.45)"
            }
          >
            {landedMult != null ? `${landedMult.toFixed(2)}x` : spinning ? "" : "0.00x"}
          </text>
        </svg>
      </div>

      {/* legend rail */}
      <div className="mt-3 flex items-stretch gap-1.5">
        {legend.map((m) => {
          const active = landedMult != null && landedMult === m;
          return (
            <div
              key={m}
              className="min-w-0 flex-1 rounded-b-[4px] px-1 py-1.5 text-center"
              style={{
                background: "#0f212e",
                borderTop: `3px solid ${colourFor(m)}`,
                opacity: landedMult != null && !active ? 0.5 : 1,
                transition: "opacity 200ms ease-out",
              }}
            >
              <span
                className="font-display text-[12px] font-black tabular-nums"
                style={{ color: active ? colourFor(m) : "#ffffff" }}
              >
                {m.toFixed(2)}x
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
