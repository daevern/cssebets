import { useEffect, useRef, useState } from "react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
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
 * Fortune Wheel cabinet. Landing segment is server-decided before motion;
 * rotation is presentation that settles on it.
 */
export function WheelBoard({
  risk,
  landedIndex,
  spinKey,
  onSettled,
  onTick,
}: {
  risk: WheelRisk;
  /** Server-decided winning segment, or null when idle. */
  landedIndex: number | null;
  /** Changes once per spin so the same segment can be replayed. */
  spinKey: number;
  onSettled: () => void;
  /** Fires as segments pass the pointer during the spin (audio cue). */
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

    // Approximate segment ticks from eased progress (presentation only).
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
        // Throttle so early fast rotation isn't a machine-gun of SFX.
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

  const R = 112;
  const C = 130;
  const R_INNER = 22;
  const R_RIM = R + 14;

  const unique = Array.from(new Set(segments)).sort((a, b) => b - a);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-3 px-3 py-2">
      <div
        className="relative rounded-[16px] border px-2 pb-3 pt-2"
        style={{
          background: T.feltOrBoardFill,
          borderColor: T.railColor,
          boxShadow: `inset 0 0 0 1px ${T.rimMetal}33`,
        }}
      >
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
            Cabinet · {risk}
          </span>
          <span className="font-display text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: T.accent }}>
            20 segments
          </span>
        </div>

        <div className="relative mx-auto w-[268px]">
          {/* pointer */}
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2" aria-hidden>
            <div
              className="mx-auto h-3 w-3 rounded-full border"
              style={{ background: T.accent, borderColor: T.rimMetal }}
            />
            <div
              className="mx-auto"
              style={{
                width: 0,
                height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: `20px solid ${T.accent}`,
                filter: "drop-shadow(0 2px 0 rgba(0,0,0,.45))",
              }}
            />
          </div>

          <svg viewBox="0 0 260 260" className="h-[268px] w-[268px]" role="img" aria-label="Fortune wheel">
            {/* outer rim */}
            <circle cx={C} cy={C} r={R_RIM} fill="#1a0a10" stroke={T.rimMetal} strokeWidth="3.5" />
            <circle cx={C} cy={C} r={R_RIM - 5} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
            {/* rim studs */}
            {Array.from({ length: 24 }).map((_, i) => {
              const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
              const x = C + (R_RIM - 2) * Math.cos(a);
              const y = C + (R_RIM - 2) * Math.sin(a);
              return <circle key={i} cx={x} cy={y} r="1.4" fill={T.accent} fillOpacity="0.55" />;
            })}

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
                      stroke={lit ? T.accent : "rgba(0,0,0,.4)"}
                      strokeWidth={lit ? 2.2 : 0.7}
                    />
                    {lit && (
                      <path
                        d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                        fill={T.accent}
                        fillOpacity="0.22"
                      />
                    )}
                    <text
                      x={tx}
                      y={ty}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={m >= 10 ? 9 : 8}
                      fontWeight="900"
                      fill={m >= 1 ? "#1a0a10" : "#ffffff"}
                      fillOpacity={m > 0 ? 1 : 0.35}
                      transform={`rotate(${(mid * 180) / Math.PI + 90} ${tx} ${ty})`}
                    >
                      {m > 0 ? `${m}×` : "0"}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* hub */}
            <circle cx={C} cy={C} r={R_INNER + 6} fill="#12060c" stroke={T.rimMetal} strokeWidth="2" />
            <circle cx={C} cy={C} r={R_INNER} fill={T.stageBg} stroke={T.accent} strokeWidth="1.5" />
            <text
              x={C}
              y={C + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="900"
              fill={T.accent}
              letterSpacing="0.12em"
            >
              CSSE
            </text>
          </svg>
        </div>
      </div>

      {/* risk legend */}
      <div
        className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-[10px] border px-2 py-2"
        style={{ background: T.hud.plaqueBg, borderColor: T.hud.plaqueBorder }}
      >
        {unique.map((m) => (
          <span
            key={m}
            className="rounded-[5px] px-2 py-1 text-[11px] font-black tabular-nums"
            style={{
              background: colourFor(m, 0),
              color: m >= 1 ? "#1a0a10" : "#ffffff",
              boxShadow: settledIdx != null && segments[settledIdx] === m ? `0 0 0 1.5px ${T.accent}` : undefined,
            }}
          >
            {m}×
          </span>
        ))}
      </div>
    </div>
  );
}
