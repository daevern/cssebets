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

/** Exponential curve path drawn up to `progress` of the visible window. */
function curvePath(progress: number, span: number, growth: number): string {
  const points: string[] = [];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = (progress * span * i) / steps;
    const x = (t / span) * VIEW_W;
    const m = crashMultiplierAt(t, growth);
    const topM = Math.max(2, crashMultiplierAt(progress * span, growth) * 1.15);
    const y = VIEW_H - ((m - 1) / (topM - 1)) * (VIEW_H - 16) - 6;
    points.push(`${x.toFixed(1)},${Math.max(4, y).toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
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

  const span = Math.max(4, crashSecondsFor(Math.max(shown, 1.6), growth));
  const path = curvePath(1, span, growth);
  const color = busted ? LOSS : banked ? T.accent : running ? T.accent : "rgba(255,255,255,.4)";

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-[190px] w-full"
          role="img"
          aria-label="Crash curve"
        >
          <defs>
            <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
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
          <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
        </svg>

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-8 flex flex-col items-center",
            busted && "motion-safe:[animation:diceTrackShock_260ms_ease-out]",
          )}
        >
          <div
            className="font-display text-[46px] font-black leading-none tabular-nums"
            style={{ color, textShadow: "0 2px 10px rgba(0,0,0,.5)" }}
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
