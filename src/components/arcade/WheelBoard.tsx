import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { WHEEL_SEGMENTS, type WheelRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.wheel;
const SPIN_MS = 4200;
const CYAN = "#00e5ff";

function colourFor(m: number, i: number): string {
  if (m >= 10) return "#ffd76a";
  if (m >= 4) return "#00e5ff";
  if (m >= 1.5) return "#ff3d7f";
  if (m >= 1) return "#a32a63";
  if (m > 0) return "#5a1c3c";
  return i % 2 === 0 ? "#2a1550" : "#1b0f35";
}

/**
 * Fortune Wheel — neon carnival cabinet: chasing bulb ring, recoiling pointer,
 * win halo burst and a lit hub readout. Presentation only.
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

  const R = 118;
  const C = 136;
  const R_INNER = 30;
  const R_RIM = R + 12;
  const landedMult = settledIdx != null ? segments[settledIdx] : null;
  const bigWin = landedMult != null && landedMult >= 2;
  const bulbs = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div
      className="relative mx-auto flex w-full max-w-[400px] flex-col items-center overflow-hidden rounded-[12px] px-2 pb-4 pt-2"
      style={{
        background: `radial-gradient(circle at 50% 42%, #2a1550 0%, ${T.feltOrBoardFill} 62%, #0d0620 100%)`,
      }}
    >
      <div className="relative w-[300px]">
        {/* neon halo burst on settle */}
        {landedMult != null ? (
          <div
            key={`halo-${spinKey}`}
            className="pointer-events-none absolute left-1/2 top-[152px] z-0 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:[animation:wheelHaloBurst_760ms_ease-out_forwards]"
            style={{
              border: `2px solid ${bigWin ? CYAN : T.accent}`,
              boxShadow: `0 0 30px ${bigWin ? "rgba(0,229,255,.5)" : "rgba(255,61,127,.4)"}`,
            }}
          />
        ) : null}

        {/* pointer */}
        <div
          key={`kick-${kick}`}
          className={cn(
            "absolute left-1/2 top-[2px] z-30 -translate-x-1/2",
            spinning && "motion-safe:[animation:wheelPointerKick_140ms_ease-out]",
          )}
          aria-hidden
        >
          <div
            className="mx-auto h-3 w-3 rounded-full"
            style={{ background: CYAN, boxShadow: `0 0 10px ${CYAN}` }}
          />
          <div
            className="mx-auto"
            style={{
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: `20px solid ${CYAN}`,
              filter: "drop-shadow(0 0 6px rgba(0,229,255,.7))",
            }}
          />
        </div>

        <svg
          viewBox="0 0 272 272"
          className="mx-auto h-[292px] w-[292px]"
          role="img"
          aria-label="Fortune wheel"
        >
          <circle cx={C} cy={C} r={R_RIM + 8} fill="#0d0620" />
          {/* chasing bulbs */}
          {bulbs.map((i) => {
            const a = (i / bulbs.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <circle
                key={i}
                cx={C + (R_RIM + 8) * Math.cos(a)}
                cy={C + (R_RIM + 8) * Math.sin(a)}
                r={2.6}
                fill={i % 2 === 0 ? CYAN : T.accent}
                style={{
                  animation: `wheelBulbChase 1.6s ease-in-out ${(i % 6) * 0.12}s infinite`,
                }}
              />
            );
          })}
          <circle cx={C} cy={C} r={R_RIM} fill="#160a2c" stroke={T.accent} strokeWidth="2" />
          <circle
            cx={C}
            cy={C}
            r={R_RIM - 5}
            fill="none"
            stroke={CYAN}
            strokeOpacity="0.35"
            strokeWidth="1"
          />

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
              const tx = C + R * 0.7 * Math.cos(mid);
              const ty = C + R * 0.7 * Math.sin(mid);
              const lit = settledIdx === i;
              return (
                <g key={i}>
                  <path
                    d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                    fill={colourFor(m, i)}
                    stroke={lit ? "#ffffff" : "rgba(0,0,0,.45)"}
                    strokeWidth={lit ? 2 : 0.6}
                  />
                  {lit ? (
                    <path
                      d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                      fill="#ffffff"
                      fillOpacity="0.22"
                    />
                  ) : null}
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={m >= 10 ? 9.5 : 8}
                    fontWeight="900"
                    fill={m >= 1 ? "#12061f" : "#ffffff"}
                    fillOpacity={m > 0 ? 1 : 0.3}
                    transform={`rotate(${(mid * 180) / Math.PI + 90} ${tx} ${ty})`}
                  >
                    {m > 0 ? `${m}×` : "0"}
                  </text>
                </g>
              );
            })}
          </g>

          <circle cx={C} cy={C} r={R_INNER + 6} fill="#0d0620" stroke={CYAN} strokeWidth="1.4" />
          <circle
            cx={C}
            cy={C}
            r={R_INNER}
            fill="#1b0f35"
            stroke={landedMult != null ? (bigWin ? CYAN : T.accent) : "rgba(255,255,255,.18)"}
            strokeWidth="1.6"
          />
          <text
            x={C}
            y={C + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={landedMult != null ? 15 : 8}
            fontWeight="900"
            fill={landedMult != null ? (bigWin ? CYAN : T.accent) : "rgba(255,255,255,.4)"}
            letterSpacing={landedMult != null ? 0 : 1.4}
          >
            {landedMult != null ? `${landedMult}×` : risk.toUpperCase()}
          </text>
        </svg>
      </div>
    </div>
  );
}
