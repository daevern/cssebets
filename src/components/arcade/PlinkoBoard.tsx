import { useEffect, useMemo, useRef, useState } from "react";
import type { PlinkoSlot } from "./types";

export type ActiveBall = {
  id: string;
  path: number[];
  landingSlot: number;
  /** ms offset relative to when the ball was added to the active list */
  startDelayMs?: number;
};

type Props = {
  rows: number;
  slots: PlinkoSlot[];
  /** Legacy single-ball mode */
  activePath?: number[] | null;
  activeLandingSlot?: number | null;
  /** New: multiple concurrent balls */
  activeBalls?: ActiveBall[] | null;
  onLanded?: () => void;
  onBallLanded?: (id: string) => void;
  reducedMotion?: boolean;
  ballColor?: string | null;
  ballAccent?: string | null;
  boardColor?: string | null;
  boardAccent?: string | null;
};

function slotFill(mult: number): { fill: string; glow: string; text: string } {
  if (mult >= 100) return { fill: "#ff2d55", glow: "rgba(255,45,85,0.55)", text: "#ffffff" };
  if (mult >= 26) return { fill: "#ff5a1f", glow: "rgba(255,90,31,0.5)", text: "#ffffff" };
  if (mult >= 9) return { fill: "#ff8a1f", glow: "rgba(255,138,31,0.45)", text: "#1a0f00" };
  if (mult >= 3) return { fill: "#ffb020", glow: "rgba(255,176,32,0.4)", text: "#1a0f00" };
  if (mult >= 1.5) return { fill: "#ffd21f", glow: "rgba(255,210,31,0.35)", text: "#1a0f00" };
  if (mult >= 1) return { fill: "#c4e64a", glow: "rgba(196,230,74,0.3)", text: "#0a1200" };
  if (mult >= 0.5) return { fill: "#5aa96b", glow: "rgba(90,169,107,0.28)", text: "#e9ffef" };
  return { fill: "#2b3a3f", glow: "rgba(0,0,0,0)", text: "#8aa0a8" };
}

type BallRuntime = {
  id: string;
  path: { x: number; y: number; pegKey?: string }[];
  landing: number;
  startTime: number;
  stepMs: number;
  landed: boolean;
  x: number;
  y: number;
  trail: { x: number; y: number; t: number }[];
  lastPegKey: string | null;
};

export function PlinkoBoard({
  rows,
  slots,
  activePath,
  activeLandingSlot,
  activeBalls,
  onLanded,
  onBallLanded,
  reducedMotion,
  ballColor,
  ballAccent,
  boardColor,
  boardAccent,
}: Props) {
  const ballFill = ballColor ?? "#ffffff";
  const ballStroke = ballAccent ?? "#ff2d55";
  const boardBg = boardColor ?? null;
  void boardAccent;

  const W = 560;
  const PADDING_X = 8;
  const PADDING_TOP = 26;
  const PADDING_BOTTOM = 66;
  const ROW_GAP = 32;
  const boardHeight = PADDING_TOP + rows * ROW_GAP + PADDING_BOTTOM;
  const innerW = W - PADDING_X * 2;

  const pegX = (row: number, i: number) => {
    const pegsInRow = row + 2;
    const spacing = innerW / (rows + 1);
    const offsetX = (W - spacing * (pegsInRow - 1)) / 2;
    return offsetX + i * spacing;
  };
  const pegY = (row: number) => PADDING_TOP + (row + 1) * ROW_GAP;

  const slotCount = rows + 1;
  const slotX = (k: number) => {
    const spacing = innerW / (rows + 1);
    const startX = (W - spacing * rows) / 2;
    return startX + k * spacing;
  };
  const slotY = boardHeight - PADDING_BOTTOM + 14;
  const spacing = innerW / (rows + 1);

  const slotColors = useMemo(() => {
    const map = new Map<number, ReturnType<typeof slotFill>>();
    for (let k = 0; k < slotCount; k++) {
      const slot = slots.find((s) => s.slot_index === k);
      const m = Number((slot as any)?.multiplier ?? 0);
      map.set(k, slotFill(m));
    }
    return map;
  }, [slots, slotCount]);

  // Normalize inputs into a unified ball list
  const normalizedBalls: ActiveBall[] = useMemo(() => {
    if (activeBalls && activeBalls.length > 0) return activeBalls;
    if (Array.isArray(activePath) && activePath.length >= rows) {
      return [
        {
          id: "single",
          path: activePath.slice(0, rows),
          landingSlot: activeLandingSlot ?? 0,
        },
      ];
    }
    return [];
  }, [activeBalls, activePath, activeLandingSlot, rows]);

  const [renderTick, setRenderTick] = useState(0);
  const [hitPegs, setHitPegs] = useState<Set<string>>(() => new Set());
  const [flashSlots, setFlashSlots] = useState<Map<number, number>>(() => new Map());
  const runtimeRef = useRef<Map<string, BallRuntime>>(new Map());
  const rafRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Add newly-arrived balls to runtime map
  useEffect(() => {
    const now = performance.now();
    const stepMs = reducedMotion ? 40 : 135;
    const currentIds = new Set(normalizedBalls.map((b) => b.id));

    for (const id of Array.from(runtimeRef.current.keys())) {
      if (!currentIds.has(id)) {
        runtimeRef.current.delete(id);
        seenIdsRef.current.delete(id);
      }
    }

    for (const b of normalizedBalls) {
      if (seenIdsRef.current.has(b.id)) continue;
      const normalizedPath = b.path.slice(0, rows).map((d) => (Number(d) === 1 ? 1 : 0));
      const startX = W / 2;
      const startY = PADDING_TOP - 14;
      const points: { x: number; y: number; pegKey?: string }[] = [{ x: startX, y: startY }];
      let colIdx = 0;
      for (let r = 0; r < rows; r++) {
        colIdx = colIdx + normalizedPath[r];
        points.push({ x: pegX(r, colIdx), y: pegY(r), pegKey: `${r}-${colIdx}` });
      }
      const landing = b.landingSlot ?? colIdx;
      points.push({ x: slotX(landing), y: slotY - 10 });

      runtimeRef.current.set(b.id, {
        id: b.id,
        path: points,
        landing,
        startTime: now + (b.startDelayMs ?? 0),
        stepMs,
        landed: false,
        x: startX,
        y: startY,
        trail: [],
        lastPegKey: null,
      });
      seenIdsRef.current.add(b.id);
    }

    if (runtimeRef.current.size > 0 && rafRef.current == null) {
      const tick = (t: number) => {
        const pegHits: string[] = [];
        const landedIds: string[] = [];
        for (const rb of runtimeRef.current.values()) {
          if (rb.landed) continue;
          const elapsed = t - rb.startTime;
          if (elapsed < 0) continue;
          const total = rb.path.length - 1;
          const idx = Math.max(0, Math.min(total, Math.floor(elapsed / rb.stepMs)));
          const frac = Math.max(0, Math.min(1, (elapsed - idx * rb.stepMs) / rb.stepMs));
          const a = rb.path[idx];
          const b2 = rb.path[Math.min(total, idx + 1)];
          if (!a || !b2) {
            rb.x = slotX(rb.landing);
            rb.y = slotY - 10;
            rb.landed = true;
            landedIds.push(rb.id);
            continue;
          }
          const eased = frac * frac * (3 - 2 * frac);
          rb.x = a.x + (b2.x - a.x) * eased;
          rb.y = a.y + (b2.y - a.y) * eased;
          rb.trail.push({ x: rb.x, y: rb.y, t });
          rb.trail = rb.trail.filter((p) => t - p.t < 260).slice(-10);

          if (b2.pegKey && b2.pegKey !== rb.lastPegKey && frac > 0.92) {
            rb.lastPegKey = b2.pegKey;
            pegHits.push(b2.pegKey);
          }
          if (idx >= total) {
            rb.landed = true;
            landedIds.push(rb.id);
          }
        }

        if (pegHits.length) {
          setHitPegs((prev) => {
            const next = new Set(prev);
            for (const k of pegHits) next.add(k);
            return next;
          });
          for (const k of pegHits) {
            setTimeout(() => {
              setHitPegs((prev) => {
                if (!prev.has(k)) return prev;
                const next = new Set(prev);
                next.delete(k);
                return next;
              });
            }, 220);
          }
        }

        if (landedIds.length) {
          for (const id of landedIds) {
            const rb = runtimeRef.current.get(id);
            if (!rb) continue;
            setFlashSlots((prev) => {
              const next = new Map(prev);
              next.set(rb.landing, (next.get(rb.landing) ?? 0) + 1);
              return next;
            });
            setTimeout(() => {
              setFlashSlots((prev) => {
                const cur = prev.get(rb.landing) ?? 0;
                if (cur <= 1) {
                  const next = new Map(prev);
                  next.delete(rb.landing);
                  return next;
                }
                const next = new Map(prev);
                next.set(rb.landing, cur - 1);
                return next;
              });
            }, 900);
            onBallLanded?.(id);
            if (id === "single") onLanded?.();
          }
        }

        setRenderTick((v) => (v + 1) % 1_000_000);

        const anyLive = Array.from(runtimeRef.current.values()).some((rb) => !rb.landed);
        if (anyLive) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      // no-op: RAF loop self-terminates when all balls land
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedBalls, rows, reducedMotion]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const pegs: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < r + 2; i++) {
      const key = `${r}-${i}`;
      const isHit = hitPegs.has(key);
      pegs.push(
        <g key={key}>
          {isHit && (
            <circle
              cx={pegX(r, i)}
              cy={pegY(r)}
              r={9}
              fill="rgba(255,255,255,0.18)"
              className="[transform-origin:center] [animation:pegFlash_320ms_ease-out_forwards]"
            />
          )}
          <circle
            cx={pegX(r, i)}
            cy={pegY(r)}
            r={3.6}
            fill={isHit ? "#ffffff" : "url(#pegGrad)"}
            style={{
              filter: isHit
                ? "drop-shadow(0 0 6px rgba(255,255,255,0.9))"
                : "drop-shadow(0 1px 1px rgba(0,0,0,0.6))",
            }}
          />
        </g>,
      );
    }
  }

  void renderTick;
  const slotWidth = spacing - 3;
  const slotFontSize = Math.max(8, Math.min(15, slotWidth * 0.42));
  const fmtMult = (m: number) => {
    if (m >= 10) return `${Math.round(m)}×`;
    if (Number.isInteger(m)) return `${m}×`;
    return `${Number(m.toFixed(2))}×`;
  };
  const liveBalls = Array.from(runtimeRef.current.values()).filter(
    (rb) => performance.now() >= rb.startTime,
  );

  return (
    <div className="relative w-full overflow-hidden" style={{ background: boardBg ?? "transparent" }}>
      <style>{`
        @keyframes pegFlash { 0%{opacity:.9;transform:scale(.4)} 100%{opacity:0;transform:scale(1.6)} }
        @keyframes slotPop { 0%{transform:translateY(0) scale(1)} 40%{transform:translateY(-3px) scale(1.04)} 100%{transform:translateY(0) scale(1)} }
        .slot-pop { animation: slotPop 600ms cubic-bezier(.2,.9,.3,1.2); transform-origin: center; transform-box: fill-box; }
      `}</style>

      <svg
        viewBox={`0 0 ${W} ${boardHeight}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Plinko board"
      >
        <defs>
          <radialGradient id="ballGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={ballFill} />
            <stop offset="100%" stopColor={ballStroke} />
          </radialGradient>
          <radialGradient id="pegGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#c8d2d6" />
            <stop offset="100%" stopColor="#5a6a70" />
          </radialGradient>
          <linearGradient id="funnelGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(64,255,140,0.25)" />
            <stop offset="100%" stopColor="rgba(64,255,140,0)" />
          </linearGradient>
          <filter id="ballShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <path
          d={`M ${W / 2 - 26} ${PADDING_TOP - 20} L ${W / 2 + 26} ${PADDING_TOP - 20} L ${W / 2 + 8} ${PADDING_TOP - 4} L ${W / 2 - 8} ${PADDING_TOP - 4} Z`}
          fill="url(#funnelGrad)"
          stroke="rgba(64,255,140,0.35)"
          strokeWidth={0.6}
        />

        {pegs}

        {liveBalls.map((rb) =>
          rb.trail.map((p, i) => {
            const alpha = ((i + 1) / rb.trail.length) * 0.32;
            return (
              <circle
                key={`t-${rb.id}-${i}`}
                cx={p.x}
                cy={p.y}
                r={5 - i * 0.15}
                fill={ballStroke}
                opacity={alpha}
              />
            );
          }),
        )}

        {Array.from({ length: slotCount }).map((_, k) => {
          const isFlash = (flashSlots.get(k) ?? 0) > 0;
          const c = slotColors.get(k)!;
          const slot = slots.find((s) => s.slot_index === k);
          const mult = Number((slot as any)?.multiplier ?? 0);
          const label = fmtMult(mult);
          const cx = slotX(k);
          return (
            <g key={`slot-${k}`} className={isFlash ? "slot-pop" : undefined}>
              <rect
                x={cx - slotWidth / 2}
                y={slotY}
                width={slotWidth}
                height={28}
                rx={6}
                fill={c.fill}
                opacity={isFlash ? 1 : 0.92}
              />
              <text
                x={cx}
                y={slotY + 19}
                textAnchor="middle"
                fontSize={slotFontSize}
                fontWeight={700}
                fill={c.text}
                textLength={
                  label.length * slotFontSize * 0.62 > slotWidth - 4 ? slotWidth - 6 : undefined
                }
                lengthAdjust="spacingAndGlyphs"
                style={{ letterSpacing: 0 }}
              >
                {label}
              </text>
            </g>
          );

        })}

        {liveBalls.map((rb) => (
          <g key={`ball-${rb.id}`}>
            <ellipse
              cx={rb.x}
              cy={rb.y + 8}
              rx={6}
              ry={2}
              fill="rgba(0,0,0,0.45)"
              filter="url(#ballShadow)"
            />
            <circle
              cx={rb.x}
              cy={rb.y}
              r={7}
              fill="url(#ballGrad)"
              stroke={ballStroke}
              strokeWidth={0.8}
              style={{ filter: `drop-shadow(0 0 6px ${ballStroke}80)` }}
            />
            <circle cx={rb.x - 2} cy={rb.y - 2.4} r={1.6} fill="rgba(255,255,255,0.9)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
