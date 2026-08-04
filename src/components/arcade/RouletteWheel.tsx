import { useEffect, useMemo, useRef, useState } from "react";
import { WHEEL_ORDER, pocketColour } from "@/lib/arcade/roulette-math";
import { cn } from "@/lib/utils";

const SEG = 360 / WHEEL_ORDER.length;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sector(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
) {
  const a = polar(cx, cy, rOuter, start);
  const b = polar(cx, cy, rOuter, end);
  const c = polar(cx, cy, rInner, end);
  const d = polar(cx, cy, rInner, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${rInner} ${rInner} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

const COLOUR_FILL: Record<string, string> = {
  green: "var(--color-neon)",
  red: "#e0374a",
  black: "#1a1f25",
};

const WOOD_RIM = "url(#woodRim)";
const WOOD_RIM_STROKE = "#2a1a0d";


export function RouletteWheel({
  winningPocket,
  spinToken,
  spinning,
  reducedMotion,
  onSettled,
  className,
}: {
  /** Server-decided winning pocket, or null before the first spin. */
  winningPocket: number | null;
  /** Changes on every new spin/replay so the animation restarts. */
  spinToken: string | null;
  spinning: boolean;
  reducedMotion?: boolean;
  onSettled?: () => void;
  className?: string;
}) {
  const [rotation, setRotation] = useState(0);
  const [ballAngle, setBallAngle] = useState(0);
  const [ballRadius, setBallRadius] = useState(92);
  const [settledPocket, setSettledPocket] = useState<number | null>(null);
  const raf = useRef<number | null>(null);

  const targetIndex = useMemo(
    () => (winningPocket == null ? 0 : WHEEL_ORDER.indexOf(winningPocket as any)),
    [winningPocket],
  );

  useEffect(() => {
    if (!spinToken || winningPocket == null) return;
    setSettledPocket(null);

    // Pocket centre in wheel-local degrees.
    const pocketMid = targetIndex * SEG + SEG / 2;

    const wheelStart = rotation;
    const ballStart = ballAngle;

    if (reducedMotion) {
      const wheelEnd = wheelStart + 360;
      setRotation(wheelEnd);
      setBallAngle(wheelEnd + pocketMid);
      setBallRadius(66);
      setSettledPocket(winningPocket);
      onSettled?.();
      return;
    }

    // Wheel keeps turning clockwise and stops at an arbitrary angle — the
    // winning pocket can end up anywhere around the rim, not under the marker.
    const wheelEnd = wheelStart + 360 * 4 + Math.random() * 360;

    // Ball orbits the opposite way and must finish sitting on the winning
    // pocket, wherever the wheel happens to leave it.
    const desired = wheelEnd + pocketMid;
    const roughEnd = ballStart - (360 * 7 + Math.random() * 360);
    // Snap the rough counter-rotating end angle onto the exact pocket angle.
    const ballEnd = desired - Math.ceil((desired - roughEnd) / 360) * 360;

    const duration = 6400;
    const dropStart = 0.6; // ball leaves the outer track and hits the frets
    const t0 = performance.now();

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.2);

    // Deflector/fret bounces: each hop is shorter and shallower than the last.
    const HOPS = [
      { w: 0.2, h: 15 },
      { w: 0.18, h: 9.5 },
      { w: 0.16, h: 5.5 },
      { w: 0.14, h: 3 },
      { w: 0.12, h: 1.4 },
      { w: 0.1, h: 0.5 },
    ];
    const hopTotal = HOPS.reduce((s, h) => s + h.w, 0);

    const TRACK_R = 92;
    const POCKET_R = 66;

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeOut(t);
      setRotation(wheelStart + (wheelEnd - wheelStart) * easeOut(Math.min(1, t * 1.05)));

      if (t < dropStart) {
        // Free orbit on the outer track, still moving fast counter to the wheel.
        setBallAngle(ballStart + (ballEnd - ballStart) * e);
        setBallRadius(TRACK_R);
      } else {
        const d = (t - dropStart) / (1 - dropStart); // 0..1 through the bounce phase
        // Angular travel keeps decaying but the collisions scrub speed harder,
        // so the ball converges on the pocket rather than gliding into it.
        const base = ballStart + (ballEnd - ballStart) * e;

        // Which hop are we in?
        let acc = 0;
        let hopIndex = HOPS.length - 1;
        let local = 1;
        const dn = d * hopTotal;
        for (let i = 0; i < HOPS.length; i++) {
          const w = HOPS[i]!.w;
          if (dn <= acc + w || i === HOPS.length - 1) {
            hopIndex = i;
            local = Math.min(1, Math.max(0, (dn - acc) / w));
            break;
          }
          acc += w;
        }
        const hop = HOPS[hopIndex]!;
        // Parabolic arc per bounce (radially outward off the fret, then back down).
        const arc = 4 * local * (1 - local) * hop.h;
        // Radial descent from the track down to the pocket ring.
        const descent = TRACK_R + (POCKET_R - TRACK_R) * easeOut(d);
        setBallRadius(descent + arc);

        // Each collision knocks the ball slightly against its direction of
        // travel; the wobble decays to zero so it settles in the right pocket.
        const kick = Math.sin(local * Math.PI) * (1 - d) * (hopIndex % 2 === 0 ? 3.2 : -2.4);
        setBallAngle(base + kick * (1 - d));
      }

      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        setBallAngle(ballEnd);
        setBallRadius(POCKET_R);
        setSettledPocket(winningPocket);
        onSettled?.();
      }
    };


    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const cx = 100;
  const cy = 100;

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[260px]", className)}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
        </defs>

        <circle cx={cx} cy={cy} r="96" fill="var(--color-surface-2)" />
        {/* Outer rim: grey outline + inner green track ring */}
        <circle cx={cx} cy={cy} r="96" fill="none" stroke="#3a4249" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="90" fill="none" stroke="#1f7a4a" strokeWidth="3" />

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "100px 100px",
          }}
        >

          {WHEEL_ORDER.map((n, i) => {
            const start = i * SEG;
            const end = start + SEG;
            const colour = pocketColour(n);
            const isWinner = settledPocket === n;
            const mid = start + SEG / 2;
            const label = polar(cx, cy, 76, mid);
            return (
              <g key={n}>
                <path
                  d={sector(cx, cy, 88, 56, start, end)}
                  fill={COLOUR_FILL[colour]}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth="0.4"
                  opacity={settledPocket != null && !isWinner ? 0.55 : 1}
                />
                {isWinner && (
                  <path
                    d={sector(cx, cy, 88, 56, start, end)}
                    fill="none"
                    stroke="var(--color-neon)"
                    strokeWidth="2"
                  />
                )}
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${mid} ${label.x} ${label.y})`}
                  fontSize="6.5"
                  fontWeight="700"
                  fill={colour === "green" ? "#06110a" : "#f4f7f5"}
                >
                  {n}
                </text>
              </g>
            );
          })}
        </g>

        {/* Hub */}
        <circle
          cx={cx}
          cy={cy}
          r="42"
          fill="var(--color-surface)"
          stroke="var(--color-surface-border)"
        />
        <circle cx={cx} cy={cy} r="34" fill="none" stroke="var(--color-neon)" strokeOpacity="0.3" />

        {/* Ball track + ball */}
        <g
          style={{
            transform: `rotate(${ballAngle}deg)`,
            transformOrigin: "100px 100px",
          }}
        >
          <circle
            cx={cx}
            cy={cy - ballRadius}
            r="4.5"
            fill="#ffffff"
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            {spinning && settledPocket == null ? "Spinning" : "Result"}
          </div>
          <div
            className={cn(
              "font-display text-3xl font-bold tabular-nums",
              settledPocket == null
                ? "text-[var(--color-ink-muted)]"
                : settledPocket === 0
                  ? "text-[var(--color-neon)]"
                  : pocketColour(settledPocket) === "red"
                    ? "text-[#ff5c6c]"
                    : "text-[var(--color-ink)]",
            )}
          >
            {settledPocket == null ? "—" : settledPocket}
          </div>
        </div>
      </div>

    </div>
  );
}
