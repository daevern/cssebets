import { useEffect, useRef, useState } from "react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { WHEEL_SEGMENTS, type WheelRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.wheel;
const SPIN_MS = 2600;

function colourFor(m: number, i: number): string {
  if (m >= 5) return "#ffd76a";
  if (m >= 1.5) return "#ff6b6b";
  if (m >= 1) return "#c2566a";
  if (m > 0) return "#7a3242";
  return i % 2 === 0 ? "#2a121b" : "#22101a";
}

/**
 * Fortune Wheel playfield. The landing segment is decided by the server
 * before the wheel moves; the rotation is presentation that lands on it.
 */
export function WheelBoard({
  risk,
  landedIndex,
  spinKey,
  onSettled,
}: {
  risk: WheelRisk;
  /** Server-decided winning segment, or null when idle. */
  landedIndex: number | null;
  /** Changes once per spin so the same segment can be replayed. */
  spinKey: number;
  onSettled: () => void;
}) {
  const segments = WHEEL_SEGMENTS[risk];
  const n = segments.length;
  const [angle, setAngle] = useState(0);
  const spinsRef = useRef(0);

  useEffect(() => {
    if (landedIndex == null) return;
    spinsRef.current += 1;
    const segAngle = 360 / n;
    // Land the middle of the winning segment under the top pointer.
    const target = 360 * 5 * spinsRef.current - (landedIndex * segAngle + segAngle / 2);
    setAngle(target);
    const t = window.setTimeout(onSettled, SPIN_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const R = 108;
  const C = 120;

  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 px-3 py-2">
      <div className="relative">
        <svg viewBox="0 0 240 240" className="h-[248px] w-[248px]" role="img" aria-label="Fortune wheel">
          <circle cx={C} cy={C} r={R + 8} fill={T.feltOrBoardFill} stroke={T.rimMetal} strokeOpacity="0.5" />
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "120px 120px",
              transition: `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.16,1)`,
            }}
          >
            {segments.map((m, i) => {
              const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
              const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
              const p = (a: number) => `${C + R * Math.cos(a)} ${C + R * Math.sin(a)}`;
              const mid = (a0 + a1) / 2;
              const tx = C + R * 0.72 * Math.cos(mid);
              const ty = C + R * 0.72 * Math.sin(mid);
              return (
                <g key={i}>
                  <path
                    d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                    fill={colourFor(m, i)}
                    stroke="rgba(0,0,0,.35)"
                    strokeWidth="0.6"
                  />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="8"
                    fontWeight="900"
                    fill={m >= 1 ? "#1a0a10" : "#ffffff"}
                    fillOpacity={m > 0 ? 1 : 0.4}
                    transform={`rotate(${(mid * 180) / Math.PI + 90} ${tx} ${ty})`}
                  >
                    {m > 0 ? `${m}x` : "0"}
                  </text>
                </g>
              );
            })}
          </g>
          <circle cx={C} cy={C} r="18" fill={T.stageBg} stroke={T.accent} strokeOpacity="0.6" />
        </svg>
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: `18px solid ${T.accent}`,
          }}
        />
      </div>

      <div
        className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border px-2 py-1.5"
        style={{ background: T.hud.plaqueBg, borderColor: T.hud.plaqueBorder }}
      >
        {Array.from(new Set(segments))
          .sort((a, b) => b - a)
          .map((m) => (
            <span
              key={m}
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-black tabular-nums"
              style={{ background: colourFor(m, 0), color: m >= 1 ? "#1a0a10" : "#ffffff" }}
            >
              {m}×
            </span>
          ))}
      </div>
    </div>
  );
}
