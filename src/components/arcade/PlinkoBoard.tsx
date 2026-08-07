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
  const PADDING_TOP = 44;
  const PADDING_BOTTOM = 132;
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
          // --- bounce physics -------------------------------------------------
          // Horizontal travel eases out (the ball is deflected sideways then keeps
          // drifting), vertical travel accelerates like gravity and gets a small
          // upward hop right after the peg impact so the ball visibly bounces.
          const isLast = idx >= total - 1;
          const xe = 1 - Math.pow(1 - frac, 2.2);
          const fall = Math.pow(frac, 1.75);
          const hopAmp = reducedMotion ? 0 : Math.min(ROW_GAP * 0.34, 14);
          const hop = -hopAmp * Math.sin(Math.PI * Math.min(1, frac * 1.05)) * (1 - frac * 0.45);
          rb.x = a.x + (b2.x - a.x) * xe;
          rb.y = a.y + (b2.y - a.y) * fall + (isLast ? 0 : hop);
          if (isLast && !reducedMotion) {
            // settle into the slot with two damped bounces
            const s = frac;
            const settle = Math.abs(Math.sin(Math.PI * s * 2.2)) * (1 - s) * 10;
            rb.y -= settle;
          }
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

  const pegR = Math.max(3.6, Math.min(6.2, 70 / rows));
  const pegs: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < r + 2; i++) {
      const key = `${r}-${i}`;
      const isHit = hitPegs.has(key);
      const cx = pegX(r, i);
      const cy = pegY(r);
      pegs.push(
        <g key={key}>
          {isHit && (
            <circle
              cx={cx}
              cy={cy}
              r={pegR * 3}
              fill="url(#pegBurst)"
              className="[transform-origin:center] [animation:pegFlash_320ms_ease-out_forwards]"
            />
          )}
          <circle cx={cx} cy={cy + pegR * 0.35} r={pegR} fill="rgba(10,6,40,0.55)" />
          <circle cx={cx} cy={cy} r={pegR} fill="url(#pegBody)" />
          <circle
            cx={cx - pegR * 0.28}
            cy={cy - pegR * 0.32}
            r={pegR * 0.36}
            fill="rgba(255,255,255,0.9)"
            opacity={isHit ? 1 : 0.7}
          />
          {isHit && <circle cx={cx} cy={cy} r={pegR * 1.35} fill="rgba(255,255,255,0.55)" />}
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

  const wallInset = spacing * 0.62;
  const wallPath = (side: -1 | 1) => {
    const pts: string[] = [];
    const topX = side === -1 ? W / 2 - spacing * 0.9 : W / 2 + spacing * 0.9;
    pts.push(`M ${topX} ${PADDING_TOP - 34}`);
    for (let r = 0; r < rows; r++) {
      // alternate the inset so the rails read as a zig-zag rather than a plain diagonal
      const zig = wallInset * (r % 2 === 0 ? 0.35 : 1.95);
      const edge = side === -1 ? pegX(r, 0) - zig : pegX(r, r + 1) + zig;
      pts.push(`L ${edge} ${pegY(r)}`);
    }
    const lastEdge =
      side === -1 ? pegX(rows - 1, 0) - wallInset : pegX(rows - 1, rows) + wallInset;
    pts.push(`L ${lastEdge} ${boardHeight - 8}`);
    return pts.join(" ");
  };


  const colTop = slotY - 4;
  const colBottom = boardHeight - 12;
  const colH = colBottom - colTop;

  return (
    <div className="relative w-full overflow-hidden" style={{ background: boardBg ?? "transparent" }}>
      <style>{`
        @keyframes pegFlash { 0%{opacity:.9;transform:scale(.4)} 100%{opacity:0;transform:scale(1.6)} }
        @keyframes slotPop { 0%{transform:translateY(0)} 22%{transform:translateY(14px)} 55%{transform:translateY(-3px)} 100%{transform:translateY(0)} }
        .slot-pop { animation: slotPop 520ms cubic-bezier(.25,.85,.35,1.1); transform-box: fill-box; }
        @keyframes beamPulse { 0%,100%{opacity:.55} 50%{opacity:1} }
        .drop-beam { animation: beamPulse 2.4s ease-in-out infinite; }
      `}</style>


      <svg
        viewBox={`0 0 ${W} ${boardHeight}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Plinko board"
      >
        <defs>
          <radialGradient id="boardGlow" cx="50%" cy="14%" r="88%">
            <stop offset="0%" stopColor="#3b40e0" />
            <stop offset="45%" stopColor="#1e2299" />
            <stop offset="100%" stopColor="#0a0e45" />
          </radialGradient>
          <radialGradient id="pegBody" cx="34%" cy="28%" r="78%">
            <stop offset="0%" stopColor="#eef0ff" />
            <stop offset="55%" stopColor="#a9b2f5" />
            <stop offset="100%" stopColor="#5661c4" />
          </radialGradient>
          <radialGradient id="pegBurst">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8f9bff" />
            <stop offset="100%" stopColor="#5b45d6" />
          </linearGradient>
          <linearGradient id="beamG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(120,210,255,0)" />
            <stop offset="100%" stopColor="rgba(120,210,255,0.85)" />
          </linearGradient>
          <radialGradient id="ballGlow">
            <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          {Array.from({ length: slotCount }).map((_, k) => {
            const c = slotColors.get(k)!;
            return (
              <linearGradient key={`sg-${k}`} id={`slotG-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.fill} stopOpacity={0} />
                <stop offset="35%" stopColor={c.fill} stopOpacity={0.18} />
                <stop offset="70%" stopColor={c.fill} stopOpacity={0.6} />
                <stop offset="100%" stopColor={c.fill} stopOpacity={1} />
              </linearGradient>
            );
          })}

        </defs>

        <rect x={0} y={0} width={W} height={boardHeight} rx={22} fill="url(#boardGlow)" />
        <rect
          x={1}
          y={1}
          width={W - 2}
          height={boardHeight - 2}
          rx={22}
          fill="none"
          stroke="rgba(150,160,255,0.22)"
        />

        {/* drop beam */}
        <rect
          className="drop-beam"
          x={W / 2 - 5}
          y={0}
          width={10}
          height={PADDING_TOP - 6}
          fill="url(#beamG)"
        />
        <circle className="drop-beam" cx={W / 2} cy={PADDING_TOP - 8} r={22} fill="url(#ballGlow)" />
        <circle cx={W / 2} cy={PADDING_TOP - 8} r={6} fill="#dff4ff" />

        {/* funnel walls */}
        <path d={wallPath(-1)} fill="none" stroke="url(#wallG)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        <path d={wallPath(1)} fill="none" stroke="url(#wallG)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        <path d={wallPath(-1)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinejoin="round" />
        <path d={wallPath(1)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinejoin="round" />

        {pegs}

        {liveBalls.map((rb) =>
          rb.trail.map((p, i) => {
            const alpha = ((i + 1) / rb.trail.length) * 0.45;
            return (
              <circle
                key={`t-${rb.id}-${i}`}
                cx={p.x}
                cy={p.y}
                r={6 - i * 0.2}
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
          const x = cx - slotWidth / 2;
          const chipH = Math.min(24, Math.max(16, slotWidth * 0.52));
          return (
            <g key={`slot-${k}`} className={isFlash ? "slot-pop" : undefined}>
              <rect
                x={x}
                y={colTop}
                width={slotWidth}
                height={colH}
                rx={5}
                fill={`url(#slotG-${k})`}
                opacity={isFlash ? 1 : 0.9}
              />
              <rect
                x={x}
                y={colTop}
                width={slotWidth}
                height={colH}
                rx={5}
                fill="none"
                stroke={c.fill}
                strokeOpacity={isFlash ? 0.95 : 0.4}
              />
              <rect
                x={x + 1}
                y={colBottom - chipH}
                width={slotWidth - 2}
                height={chipH - 1}
                rx={4}
                fill={c.fill}
              />
              <text
                x={cx}
                y={colBottom - chipH / 2 + slotFontSize * 0.36}
                textAnchor="middle"
                fontSize={slotFontSize}
                fontWeight={800}
                fill={c.text}
                textLength={
                  label.length * slotFontSize * 0.62 > slotWidth - 6 ? slotWidth - 8 : undefined
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
            <circle cx={rb.x} cy={rb.y} r={16} fill="url(#ballGlow)" />
            <circle cx={rb.x} cy={rb.y} r={7} fill={ballFill} stroke={ballStroke} strokeWidth={1.4} />
            <circle cx={rb.x - 2.2} cy={rb.y - 2.4} r={2.2} fill="rgba(255,255,255,0.95)" />
          </g>
        ))}
      </svg>
    </div>

  );
}
