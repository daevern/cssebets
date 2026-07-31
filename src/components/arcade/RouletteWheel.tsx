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
  black: "#161c22",
};

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
  const [ballRotation, setBallRotation] = useState(0);
  const [ballSeated, setBallSeated] = useState(false);
  const [settledPocket, setSettledPocket] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spins = useRef(0);

  const targetIndex = useMemo(
    () => (winningPocket == null ? 0 : WHEEL_ORDER.indexOf(winningPocket as any)),
    [winningPocket],
  );

  useEffect(() => {
    if (!spinToken || winningPocket == null) return;
    setSettledPocket(null);
    setBallSeated(false);
    spins.current += 1;
    const base = -(targetIndex * SEG) - SEG / 2;
    const next =
      base - 360 * (reducedMotion ? 0 : 5) - 360 * (reducedMotion ? 0 : spins.current % 2);
    setRotation(next);
    setBallRotation((r) => {
      const whole = Math.round(r / 360) * 360;
      return whole + 360 * (reducedMotion ? 1 : 8);
    });
    const duration = reducedMotion ? 200 : 4200;
    if (timer.current) clearTimeout(timer.current);
    if (seatTimer.current) clearTimeout(seatTimer.current);
    seatTimer.current = setTimeout(() => setBallSeated(true), Math.max(0, duration - 900));
    timer.current = setTimeout(() => {
      setSettledPocket(winningPocket);
      onSettled?.();
    }, duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (seatTimer.current) clearTimeout(seatTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const cx = 100;
  const cy = 100;

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[320px]", className)}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <radialGradient id="rw-face" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.25)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <filter id="rw-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={cx}
          cy={cy}
          r="96"
          fill="var(--color-surface-2)"
          stroke="var(--color-surface-border)"
        />
        <circle
          cx={cx}
          cy={cy}
          r="90"
          fill="none"
          stroke="var(--color-neon)"
          strokeOpacity="0.25"
          strokeWidth="1"
        />

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "100px 100px",
            transition: reducedMotion
              ? "transform 200ms linear"
              : "transform 4200ms cubic-bezier(0.12, 0.7, 0.12, 1)",
          }}
        >
          {WHEEL_ORDER.map((n, i) => {
            const start = i * SEG;
            const end = start + SEG;
            const colour = pocketColour(n);
            const isWinner = settledPocket === n;
            const mid = start + SEG / 2;
            const label = polar(cx, cy, 68, mid);
            return (
              <g key={n}>
                <path
                  d={sector(cx, cy, 88, 44, start, end)}
                  fill={COLOUR_FILL[colour]}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth="0.6"
                  opacity={settledPocket != null && !isWinner ? 0.55 : 1}
                />
                {isWinner && (
                  <path
                    d={sector(cx, cy, 88, 44, start, end)}
                    fill="none"
                    stroke="var(--color-neon)"
                    strokeWidth="2"
                    filter="url(#rw-glow)"
                  />
                )}
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${mid} ${label.x} ${label.y})`}
                  fontSize="11"
                  fontWeight="700"
                  fill={colour === "green" ? "#06110a" : "#f4f7f5"}
                >
                  {n}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="88" fill="url(#rw-face)" pointerEvents="none" />
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
            transform: `rotate(${ballRotation}deg)`,
            transformOrigin: "100px 100px",
            transition: reducedMotion
              ? "transform 200ms linear"
              : "transform 4200ms cubic-bezier(0.08, 0.8, 0.1, 1)",
          }}
        >
          <circle
            cx={cx}
            cy={cy - (ballSeated ? 66 : 82)}
            r="4.5"
            fill="#ffffff"
            filter="url(#rw-glow)"
            style={{ transition: reducedMotion ? "none" : "cy 900ms cubic-bezier(0.3, 0.8, 0.2, 1)" }}
          />
        </g>

        {/* Top marker */}
        <path d="M 100 6 L 106 18 L 94 18 Z" fill="var(--color-neon)" />
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
          {settledPocket != null && (
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
              {pocketColour(settledPocket)}
              {settledPocket !== 0 && (
                <>
                  {" "}
                  · {settledPocket % 2 === 0 ? "Even" : "Odd"} ·{" "}
                  {settledPocket <= 6 ? "Low" : "High"}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
