import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PlinkoSlot } from "./types";
import { PlinkoPeg } from "./PlinkoPeg";
import { PlinkoBall } from "./PlinkoBall";
import { PlinkoBoardFrame } from "./PlinkoBoardFrame";
import { PlinkoPayoutBin } from "./PlinkoPayoutBin";


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
  /** Control band rendered under the title */
  riskOptions?: { key: string; label: string }[];
  risk?: string;
  onRiskChange?: (key: string) => void;
  modeOptions?: { key: string; label: string }[];
  mode?: string;
  onModeChange?: (key: string) => void;
  rowOptions?: number[];
  onRowsChange?: (rows: number) => void;
  controlsDisabled?: boolean;
};


function slotFill(mult: number): { fill: string; glow: string; text: string } {
  // Palette matched to the neon poster: magenta/orange extremes, violet mids,
  // teal → deep blue toward the centre (lowest multipliers).
  if (mult >= 50) return { fill: "#ff7a18", glow: "rgba(255,122,24,0.55)", text: "#ffca8a" };
  if (mult >= 15) return { fill: "#ff2f92", glow: "rgba(255,47,146,0.5)", text: "#ffa9d0" };
  if (mult >= 4) return { fill: "#c04ff0", glow: "rgba(192,79,240,0.45)", text: "#e8b9ff" };
  if (mult >= 1.8) return { fill: "#9a5cff", glow: "rgba(154,92,255,0.4)", text: "#d9c4ff" };
  if (mult >= 1.1) return { fill: "#2ad3d3", glow: "rgba(42,211,211,0.38)", text: "#a8fbfb" };
  if (mult >= 0.55) return { fill: "#3b8cff", glow: "rgba(59,140,255,0.34)", text: "#b8d6ff" };
  if (mult > 0) return { fill: "#2b4bd6", glow: "rgba(43,75,214,0.3)", text: "#a9bbff" };
  return { fill: "#25306b", glow: "rgba(0,0,0,0)", text: "#8b96c8" };
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
  const ballStroke = ballAccent ?? "#8f9bff";
  const boardBg = boardColor ?? null;
  const railAccent = boardAccent ?? "#6b76c4";

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
  const frameSkip = useRef(0);

  // Add newly-arrived balls to runtime map
  useEffect(() => {
    const now = performance.now();
    const stepMs = reducedMotion ? 70 : 230;
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
            const s = frac;
            const settle = Math.abs(Math.sin(Math.PI * s * 2.2)) * (1 - s) * 10;
            rb.y -= settle;
          }
          // Short trail only — fewer DOM nodes per frame.
          if (rb.trail.length === 0 || t - (rb.trail[rb.trail.length - 1]?.t ?? 0) > 40) {
            rb.trail.push({ x: rb.x, y: rb.y, t });
            rb.trail = rb.trail.filter((p) => t - p.t < 180).slice(-5);
          }


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

        // ~30fps React paints — positions live in refs; tick only drives SVG refresh.
        frameSkip.current = (frameSkip.current + 1) % 2;
        if (frameSkip.current === 0 || landedIds.length || pegHits.length) {
          setRenderTick((v) => (v + 1) % 1_000_000);
        }

        const anyLive = Array.from(runtimeRef.current.values()).some((rb) => !rb.landed);
        if (anyLive) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setRenderTick((v) => (v + 1) % 1_000_000);
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
      pegs.push(
        <PlinkoPeg key={key} cx={pegX(r, i)} cy={pegY(r)} r={pegR} active={hitPegs.has(key)} />,
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


  const colTop = slotY - 34;
  const colBottom = boardHeight - 14;
  const pinH = 16; // thin neon pin above each column body
  const bodyTop = colTop + pinH;



  return (
    <div className="relative w-full overflow-hidden" style={{ background: boardBg ?? "transparent" }}>
      {/* Title and selectors live off-board: MiniCabinetTitle + ControlDock. */}




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
          <radialGradient id="boardGlow" cx="50%" cy="16%" r="92%">
            <stop offset="0%" stopColor="#2b34cf" />
            <stop offset="42%" stopColor="#141a86" />
            <stop offset="78%" stopColor="#080c40" />
            <stop offset="100%" stopColor="#04061c" />
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
            <stop offset="0%" stopColor="rgba(41,196,255,0.65)" />
            <stop offset="100%" stopColor="rgba(41,196,255,0)" />
          </radialGradient>
          <radialGradient id="ballBody" cx="36%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#F4FFFF" />
            <stop offset="55%" stopColor="#8FE9FF" />
            <stop offset="100%" stopColor="#33CFFF" />
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

        {/* stylized cabinet frame */}
        <PlinkoBoardFrame left={wallPath(-1)} right={wallPath(1)} stroke={railAccent} />


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
          const c = slotColors.get(k)!;
          const slot = slots.find((s) => s.slot_index === k);
          const cx = slotX(k);
          return (
            <PlinkoPayoutBin
              key={`slot-${k}`}
              index={k}
              label={fmtMult(Number((slot as any)?.multiplier ?? 0))}
              color={c.fill}
              textColor={c.text}
              active={(flashSlots.get(k) ?? 0) > 0}
              cx={cx}
              x={cx - slotWidth / 2}
              width={slotWidth}
              colTop={colTop}
              bodyTop={bodyTop}
              colBottom={colBottom}
              pinH={pinH}
              chipH={Math.min(24, Math.max(16, slotWidth * 0.52))}
              fontSize={slotFontSize}
            />
          );
        })}

        {liveBalls.map((rb) => (
          <PlinkoBall key={`ball-${rb.id}`} cx={rb.x} cy={rb.y} fill={ballFill} accent={ballStroke} />
        ))}

      </svg>
    </div>

  );
}
