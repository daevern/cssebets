import { useEffect, useRef, useState } from "react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { CsseMark } from "@/components/brand/CsseMark";
import { WHEEL_SEGMENTS, type WheelRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.wheel;
const SPIN_MS = 4200;

function colourFor(m: number, i: number): string {
  if (m >= 10) return "#ffd76a";
  if (m >= 4) return "#ffb347";
  if (m >= 1.5) return "#ff6b6b";
  if (m >= 1) return "#c2566a";
  if (m > 0) return "#7a3242";
  return i % 2 === 0 ? "#2a121b" : "#1a0c12";
}

/**
 * Fortune Wheel — one composition: pointer + wheel + hub mark.
 * Risk table lives in the dock; no legend strip on the stage.
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
  const spinsRef = useRef(0);
  const angleRef = useRef(0);
  const lastSegRef = useRef(-1);
  const tickRaf = useRef<number | null>(null);

  useEffect(() => {
    if (landedIndex == null) return;
    setSettledIdx(null);
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
      onSettled();
    }, SPIN_MS);

    return () => {
      window.clearTimeout(t);
      if (tickRaf.current) cancelAnimationFrame(tickRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const R = 118;
  const C = 136;
  const R_INNER = 26;
  const R_RIM = R + 12;
  const landedMult = settledIdx != null ? segments[settledIdx] : null;

  return (
    <div
      className="relative mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 overflow-hidden rounded-[12px] px-2 pb-4 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="relative w-[280px]">
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2" aria-hidden>
          <div
            className="mx-auto h-2.5 w-2.5 rounded-full"
            style={{ background: T.accent }}
          />
          <div
            className="mx-auto"
            style={{
              width: 0,
              height: 0,
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderTop: `18px solid ${T.accent}`,
            }}
          />
        </div>

        <svg viewBox="0 0 272 272" className="h-[280px] w-[280px]" role="img" aria-label="Fortune wheel">
          <circle cx={C} cy={C} r={R_RIM} fill="#14080e" stroke={T.rimMetal} strokeWidth="3" />
          <circle cx={C} cy={C} r={R_RIM - 4.5} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />

          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: `${C}px ${C}px`,
              transition: `transform ${SPIN_MS}ms cubic-bezier(.08,.7,.12,1)`,
            }}
          >
            {segments.map((m, i) => {
              const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
              const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
              const p = (a: number, r = R) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
              const mid = (a0 + a1) / 2;
              const tx = C + R * 0.68 * Math.cos(mid);
              const ty = C + R * 0.68 * Math.sin(mid);
              const lit = settledIdx === i;
              return (
                <g key={i}>
                  <path
                    d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                    fill={colourFor(m, i)}
                    stroke={lit ? T.accent : "rgba(0,0,0,.35)"}
                    strokeWidth={lit ? 2 : 0.6}
                  />
                  {lit ? (
                    <path
                      d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                      fill={T.accent}
                      fillOpacity="0.2"
                    />
                  ) : null}
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={m >= 10 ? 9 : 8}
                    fontWeight="900"
                    fill={m >= 1 ? "#1a0a10" : "#ffffff"}
                    fillOpacity={m > 0 ? 1 : 0.32}
                    transform={`rotate(${(mid * 180) / Math.PI + 90} ${tx} ${ty})`}
                  >
                    {m > 0 ? `${m}×` : "0"}
                  </text>
                </g>
              );
            })}
          </g>

          <circle cx={C} cy={C} r={R_INNER + 5} fill="#12060c" stroke={T.rimMetal} strokeWidth="1.8" />
          <circle cx={C} cy={C} r={R_INNER} fill={T.stageBg} stroke={T.accent} strokeWidth="1.2" />
        </svg>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <CsseMark variant="mono" className="h-5 w-5" style={{ color: T.accent }} />
        </div>
      </div>

      {landedMult != null ? (
        <div className="font-display text-lg font-black tabular-nums" style={{ color: T.accent }}>
          {landedMult}×
        </div>
      ) : (
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
          {risk} table
        </div>
      )}
    </div>
  );
}
