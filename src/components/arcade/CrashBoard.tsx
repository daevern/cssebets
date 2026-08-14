import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import {
  CRASH_CAP,
  crashMultiplierAt,
  crashSecondsFor,
  crashSurvivalChance,
} from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.crash;
const LOSS = "#ff4d5e";

function StatCell({ label, value, tone }: { label: string; value: string; tone?: "accent" | "loss" }) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-[6px] border px-2.5 py-2"
      style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
    >
      <span className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span
        className="font-display text-[15px] font-black tabular-nums leading-none"
        style={{ color: tone === "accent" ? T.accent : tone === "loss" ? LOSS : "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Live multiplier clock. The browser only *draws* the curve — the server
 * clock (round `createdAt`) decides every payout, so a paused or throttled
 * tab can never mint a better multiplier.
 */
function useLiveMultiplier(startedAt: string | null, growth: number, running: boolean) {
  const [value, setValue] = useState(1);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (!running || !startedAt) return;
    const t0 = new Date(startedAt).getTime();
    const tick = () => {
      const seconds = (Date.now() - t0) / 1000;
      setValue(crashMultiplierAt(Math.max(0, seconds), growth));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [startedAt, growth, running]);

  useEffect(() => {
    if (!running) setValue(1);
  }, [running]);

  return value;
}

const VIEW_W = 420;
const VIEW_H = 190;

/** Cold → hot heat ramp: the higher the multiplier, the hotter the curve. */
const HEAT: Array<[number, [number, number, number]]> = [
  [1.0, [56, 189, 248]], // ice blue
  [1.5, [45, 212, 191]], // teal
  [2.0, [74, 222, 128]], // green
  [3.0, [250, 204, 21]], // amber
  [5.0, [251, 146, 60]], // orange
  [10.0, [244, 63, 94]], // hot red
  [25.0, [255, 0, 128]], // magenta blowout
];

function heatColor(m: number, alpha = 1): string {
  const v = Math.max(1, m);
  let lo = HEAT[0];
  let hi = HEAT[HEAT.length - 1];
  for (let i = 0; i < HEAT.length - 1; i++) {
    if (v >= HEAT[i][0] && v <= HEAT[i + 1][0]) {
      lo = HEAT[i];
      hi = HEAT[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  const c = lo[1].map((x, i) => Math.round(x + (hi[1][i] - x) * Math.min(1, Math.max(0, t))));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/**
 * Exponential curve path drawn up to `progress` of the visible window.
 * The horizontal window is deliberately compressed as the run gets longer,
 * so the tail whips near-vertical — pure presentation, payouts are unchanged.
 */
function curvePath(progress: number, span: number, growth: number): string {
  const points: string[] = [];
  const steps = 56;
  const head = crashMultiplierAt(progress * span, growth);
  // Tight headroom keeps the nose pinned to the ceiling → steeper read.
  const topM = Math.max(1.35, head * 1.03);
  for (let i = 0; i <= steps; i++) {
    const t = (progress * span * i) / steps;
    const x = (t / span) * VIEW_W;
    const m = crashMultiplierAt(t, growth);
    // Power easing bends the mid-section down so the finish looks explosive.
    const norm = Math.pow(Math.max(0, (m - 1) / Math.max(0.001, topM - 1)), 1.45);
    const y = VIEW_H - norm * (VIEW_H - 18) - 6;
    points.push(`${x.toFixed(1)},${Math.max(4, y).toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
}

/** Tip coordinates of the drawn curve (for the rocket dot). */
function curveTip(span: number, growth: number): { x: number; y: number } {
  const head = crashMultiplierAt(span, growth);
  const topM = Math.max(1.35, head * 1.03);
  const norm = Math.pow(Math.max(0, (head - 1) / Math.max(0.001, topM - 1)), 1.45);
  return { x: VIEW_W, y: Math.max(4, VIEW_H - norm * (VIEW_H - 18) - 6) };
}


/**
 * Crash playfield — Stake-style slate console: rising curve, floating
 * multiplier pill and live survival stats.
 */
export function CrashBoard({
  startedAt,
  running,
  crashedAt,
  cashedAt,
  autoCashout,
  growth,
}: {
  startedAt: string | null;
  running: boolean;
  /** Multiplier the run busted at, once revealed. */
  crashedAt: number | null;
  /** Multiplier the player banked, once revealed. */
  cashedAt: number | null;
  autoCashout: number | null;
  growth: number;
}) {
  const live = useLiveMultiplier(startedAt, growth, running);
  const shown = running ? live : (cashedAt ?? crashedAt ?? 1);
  const busted = !running && crashedAt != null && cashedAt == null;
  const banked = !running && cashedAt != null;

  // Damped horizontal window: the longer the run, the more the curve is
  // squeezed sideways, so the nose whips upward instead of drifting.
  const rawSpan = Math.max(3, crashSecondsFor(Math.max(shown, 1.5), growth));
  const span = 3 + (rawSpan - 3) * 0.42;
  const path = curvePath(1, span, growth);
  const tip = curveTip(span, growth);
  const heat = heatColor(shown);
  const color = busted ? LOSS : banked ? T.accent : running ? heat : "rgba(255,255,255,.4)";
  // Heat intensity drives glow + shake once the run gets scary.
  const intensity = Math.min(1, Math.max(0, (shown - 1.5) / 8.5));

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-3"
      style={{
        background: T.feltOrBoardFill,
        boxShadow: running
          ? `inset 0 0 ${40 + intensity * 90}px ${heatColor(shown, 0.05 + intensity * 0.22)}`
          : undefined,
      }}
    >
      <div
        className={cn(
          "relative",
          running && intensity > 0.55 && "motion-safe:[animation:diceTrackShock_420ms_ease-in-out_infinite]",
        )}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-[190px] w-full"
          role="img"
          aria-label="Crash curve"
        >
          <defs>
            <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18 + intensity * 0.34} />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="crashStroke" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={heatColor(1)} />
              <stop offset="45%" stopColor={heatColor(Math.max(1.4, shown * 0.5))} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1={0}
              x2={VIEW_W}
              y1={VIEW_H * g}
              y2={VIEW_H * g}
              stroke="rgba(255,255,255,.06)"
              strokeWidth={1}
            />
          ))}
          <path d={`${path} L ${VIEW_W},${VIEW_H} L 0,${VIEW_H} Z`} fill="url(#crashFill)" />
          {/* Soft heat bloom underneath the stroke. */}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeOpacity={0.18 + intensity * 0.4}
            strokeWidth={9 + intensity * 9}
            strokeLinecap="round"
          />
          <path
            d={path}
            fill="none"
            stroke={busted || banked ? color : "url(#crashStroke)"}
            strokeWidth={3 + intensity * 1.6}
            strokeLinecap="round"
          />
          {running && (
            <>
              <circle cx={tip.x} cy={tip.y} r={10 + intensity * 8} fill={heatColor(shown, 0.22)} />
              <circle cx={tip.x} cy={tip.y} r={4 + intensity * 2} fill={color} />
            </>
          )}
        </svg>

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-8 flex flex-col items-center",
            busted && "motion-safe:[animation:diceTrackShock_260ms_ease-out]",
          )}
        >
          <div
            className="font-display font-black leading-none tabular-nums transition-[font-size] duration-200"
            style={{
              color,
              fontSize: `${46 + intensity * 18}px`,
              textShadow: `0 2px 10px rgba(0,0,0,.5), 0 0 ${12 + intensity * 34}px ${heatColor(shown, 0.35 + intensity * 0.4)}`,
            }}
          >
            {shown.toFixed(2)}×
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/40">
            {busted ? "busted" : banked ? "banked" : running ? "in flight" : "ready"}
          </div>
        </div>
      </div>


      <div className="mt-2 flex items-stretch gap-2">
        <StatCell
          label="Chance now"
          value={`${(crashSurvivalChance(Math.max(shown, 1.01)) * 100).toFixed(1)}%`}
        />
        <StatCell label="Auto" value={autoCashout ? `${autoCashout.toFixed(2)}×` : "off"} />
        <StatCell label="Cap" value={`${CRASH_CAP}×`} />
      </div>
    </div>
  );
}
