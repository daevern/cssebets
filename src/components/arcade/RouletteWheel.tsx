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
  green: "#00e701",
  red: "#d0455a",
  black: "#16242e",
};

const WOOD_RIM = "url(#woodRim)";
const WOOD_RIM_STROKE = "rgba(255,255,255,.08)";


export function RouletteWheel({
  winningPocket,
  spinToken,
  spinning,
  reducedMotion,
  onSettled,
  onHop,
  onFrame,

  className,
}: {
  /** Server-decided winning pocket, or null before the first spin. */
  winningPocket: number | null;
  /** Changes on every new spin/replay so the animation restarts. */
  spinToken: string | null;
  spinning: boolean;
  reducedMotion?: boolean;
  onSettled?: () => void;
  /**
   * Fires once per real fret collision as the ball drops off the outer
   * track — not once per animation frame. `energy` is that bounce's height
   * normalised against the first (hardest) bounce, so callers can scale
   * volume/pitch to match what's actually happening on screen.
   */
  onHop?: (info: { index: number; energy: number }) => void;
  /**
   * Per-frame ball telemetry for velocity-synced audio: `speed` is the ball's
   * angular speed normalised against its launch speed (1 → 0), `onTrack` is
   * true while it is still riding the outer track.
   */
  onFrame?: (info: { speed: number; onTrack: boolean }) => void;
  className?: string;
}) {

  const [settledPocket, setSettledPocket] = useState<number | null>(null);
  const raf = useRef<number | null>(null);
  const lastHop = useRef<number>(-1);
  const wheelRef = useRef<SVGGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const ballShadowRef = useRef<SVGEllipseElement | null>(null);
  const ballDotRef = useRef<SVGCircleElement | null>(null);
  const rotationRef = useRef(0);
  const ballAngleRef = useRef(0);
  const frameAudioAt = useRef(0);

  const targetIndex = useMemo(
    () => (winningPocket == null ? 0 : WHEEL_ORDER.indexOf(winningPocket as any)),
    [winningPocket],
  );

  useEffect(() => {
    if (!spinToken || winningPocket == null) return;
    setSettledPocket(null);
    lastHop.current = -1;

    const pocketMid = targetIndex * SEG + SEG / 2;
    const wheelStart = rotationRef.current;
    const ballStart = ballAngleRef.current;

    const applyPose = (rot: number, ang: number, radius: number) => {
      rotationRef.current = rot;
      ballAngleRef.current = ang;
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${rot}deg)`;
      }
      if (ballRef.current) {
        ballRef.current.style.transform = `rotate(${ang}deg)`;
      }
      if (ballShadowRef.current) {
        ballShadowRef.current.setAttribute("cy", String(100 - radius + 2.2));
      }
      if (ballDotRef.current) {
        ballDotRef.current.setAttribute("cy", String(100 - radius));
      }
    };

    if (reducedMotion) {
      const wheelEnd = wheelStart + 360;
      applyPose(wheelEnd, wheelEnd + pocketMid, 66);
      setSettledPocket(winningPocket);
      onSettled?.();
      return;
    }

    const wheelEnd = wheelStart + 360 * 4 + Math.random() * 360;
    const desired = wheelEnd + pocketMid;
    const roughEnd = ballStart - (360 * 7 + Math.random() * 360);
    const ballEnd = desired - Math.ceil((desired - roughEnd) / 360) * 360;

    const duration = 4800;
    const dropStart = 0.6;
    const t0 = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.2);

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
      const rot = wheelStart + (wheelEnd - wheelStart) * easeOut(Math.min(1, t * 1.05));

      if (now - frameAudioAt.current > 48) {
        frameAudioAt.current = now;
        onFrame?.({ speed: Math.pow(1 - t, 2.2), onTrack: t < dropStart });
      }

      let ang = ballStart + (ballEnd - ballStart) * e;
      let radius = TRACK_R;

      if (t >= dropStart) {
        const d = (t - dropStart) / (1 - dropStart);
        const base = ballStart + (ballEnd - ballStart) * e;
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
        if (hopIndex !== lastHop.current && local >= 0.5) {
          lastHop.current = hopIndex;
          onHop?.({ index: hopIndex, energy: hop.h / HOPS[0]!.h });
        }
        const arc = 4 * local * (1 - local) * hop.h;
        const descent = TRACK_R + (POCKET_R - TRACK_R) * easeOut(d);
        radius = descent + arc;
        const kick = Math.sin(local * Math.PI) * (1 - d) * (hopIndex % 2 === 0 ? 3.2 : -2.4);
        ang = base + kick * (1 - d);
      }

      applyPose(rot, ang, radius);

      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        applyPose(wheelEnd, ballEnd, POCKET_R);
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
    <div className={cn("relative mx-auto aspect-square w-full max-w-[320px]", className)}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <radialGradient id="woodRim" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#2f4553" />
            <stop offset="20%" stopColor="#3d5665" />
            <stop offset="40%" stopColor="#213743" />
            <stop offset="55%" stopColor="#557086" />
            <stop offset="75%" stopColor="#26404f" />
            <stop offset="100%" stopColor="#3d5665" />
          </radialGradient>
          <linearGradient id="goldRing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b6ffc4" />
            <stop offset="45%" stopColor="#00e701" />
            <stop offset="100%" stopColor="#046b14" />
          </linearGradient>
          <radialGradient id="hubSpec" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
          </radialGradient>
          <radialGradient id="ballSpec" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f2ede0" />
            <stop offset="100%" stopColor="#b9b1a0" />
          </radialGradient>
        </defs>

        {/* Outer rim: wood finish with dark edge */}
        <circle cx={cx} cy={cy} r="96" fill={WOOD_RIM} stroke={WOOD_RIM_STROKE} strokeWidth="2" />
        {/* Inner surface behind the pockets */}
        <circle
          cx={cx}
          cy={cy}
          r="91.5"
          fill="none"
          stroke="url(#goldRing)"
          strokeWidth="1.4"
          style={
            spinning || reducedMotion
              ? undefined
              : { animation: "rouletteRimBreathe 4.5s ease-in-out infinite" }
          }
        />
        <circle cx={cx} cy={cy} r="90" fill="var(--color-surface-2)" stroke="#2f4553" strokeWidth="3" />


        <g
          ref={wheelRef}
          style={{
            transform: `rotate(${rotationRef.current}deg)`,
            transformOrigin: "100px 100px",
            willChange: "transform",
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
                {(() => {
                  const a = polar(cx, cy, 88, start);
                  const b = polar(cx, cy, 56, start);
                  return (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="url(#goldRing)"
                      strokeOpacity="0.55"
                      strokeWidth="0.7"
                    />
                  );
                })()}
                {isWinner && (
                  <path
                    d={sector(cx, cy, 88, 56, start, end)}
                    fill="none"
                    stroke="#00e701"
                    strokeWidth="2.4"
                    style={{
                      animation: reducedMotion
                        ? undefined
                        : "rouletteWinFlash 300ms ease-out 2",
                    }}
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
                  fill={colour === "green" ? "#03210a" : "#f4f7f5"}
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
        <circle cx={cx} cy={cy} r="42" fill="url(#hubSpec)" />
        <circle cx={cx} cy={cy} r="34" fill="none" stroke="url(#goldRing)" strokeOpacity="0.55" />

        {/* Ball track + ball */}
        <g
          ref={ballRef}
          style={{
            transform: `rotate(${ballAngleRef.current}deg)`,
            transformOrigin: "100px 100px",
            willChange: "transform",
          }}
        >
          <ellipse
            ref={ballShadowRef}
            cx={cx + 1.6}
            cy={cy - 92 + 2.2}
            rx="4.8"
            ry="3.4"
            fill="#000000"
            opacity="0.4"
          />
          <circle ref={ballDotRef} cx={cx} cy={cy - 92} r="4.5" fill="url(#ballSpec)" />
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
