import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { WHEEL_SEGMENTS, type WheelRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.wheel;
const SPIN_MS = 4200;
const LOSS = "#ff4d5e";
const POINTER = "#ffffff";

/** Stake-style segment tiers: green ladder for wins, red/slate for misses. */
function colourFor(m: number, i: number): string {
  if (m >= 10) return "#d5ff4a";
  if (m >= 4) return "#7bffb0";
  if (m >= 1.5) return "#00e701";
  if (m >= 1) return "#12a527";
  if (m > 0) return "#155e2a";
  return i % 2 === 0 ? "#2f4553" : "#1c2f3b";
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "loss";
}) {
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
 * Fortune Wheel — Stake-style slate console matching Dice/Hi-Lo: flat slate
 * board, green-tier segments, white pointer and live stat cells.
 * Presentation only.
 */
export function WheelBoard({
  risk,
  landedIndex,
  spinKey,
  onSettled,
  onTick,
}: {
  risk: WheelRisk;
  landedIndex: number | null;
  spinKey: number;
  onSettled: () => void;
  onTick?: () => void;
}) {
  const segments = WHEEL_SEGMENTS[risk];
  const n = segments.length;
  const [angle, setAngle] = useState(0);
  const [settledIdx, setSettledIdx] = useState<number | null>(null);
  const [kick, setKick] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spinsRef = useRef(0);
  const angleRef = useRef(0);
  const lastSegRef = useRef(-1);
  const tickRaf = useRef<number | null>(null);

  useEffect(() => {
    if (landedIndex == null) return;
    setSettledIdx(null);
    setSpinning(true);
    spinsRef.current += 1;
    const segAngle = 360 / n;
    const target = 360 * 6 * spinsRef.current - (landedIndex * segAngle + segAngle / 2);
    const startAngle = angleRef.current;
    angleRef.current = target;
    setAngle(target);

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
        setKick((k) => k + 1);
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
      setSpinning(false);
      onSettled();
    }, SPIN_MS);

    return () => {
      window.clearTimeout(t);
      if (tickRaf.current) cancelAnimationFrame(tickRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const R = 118;
  const C = 136;
  const R_INNER = 34;
  const R_RIM = R + 10;
  const landedMult = settledIdx != null ? segments[settledIdx] : null;
  const won = landedMult != null ? landedMult >= 1 : null;
  const bestMult = Math.max(...segments);
  const winCount = segments.filter((m) => m >= 1).length;
  const chance = (winCount / n) * 100;

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      {/* result pill */}
      <div className="relative flex h-[70px] items-start justify-center">
        <div
          key={`pill-${spinKey}-${settledIdx ?? "x"}`}
          className={cn(
            "rounded-[8px] border px-4 py-2 text-center",
            landedMult != null && "motion-safe:[animation:dicePillLand_360ms_ease-out]",
          )}
          style={{
            background: "#0f212e",
            borderColor: won == null ? "rgba(255,255,255,.12)" : won ? T.accent : LOSS,
            boxShadow:
              won == null
                ? "none"
                : `0 0 0 1px ${won ? "rgba(0,231,1,.25)" : "rgba(255,77,94,.25)"}`,
          }}
        >
          <div
            className="font-display text-[26px] font-black tabular-nums leading-none"
            style={{ color: won == null ? "rgba(255,255,255,.55)" : won ? T.accent : LOSS }}
          >
            {landedMult != null ? `${landedMult.toFixed(2)}×` : spinning ? "—" : "0.00×"}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
            {spinning ? "spinning" : won == null ? "ready" : won ? "win" : "bust"}
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-[292px]">
        {/* pointer */}
        <div
          key={`kick-${kick}`}
          className={cn(
            "absolute left-1/2 top-0 z-30 -translate-x-1/2",
            spinning && "motion-safe:[animation:wheelPointerKick_140ms_ease-out]",
          )}
          aria-hidden
        >
          <div
            className="mx-auto"
            style={{
              width: 0,
              height: 0,
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderTop: `18px solid ${POINTER}`,
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,.6))",
            }}
          />
        </div>

        <svg
          viewBox="0 0 272 272"
          className="mx-auto h-[280px] w-[280px]"
          role="img"
          aria-label="Fortune wheel"
        >
          <circle cx={C} cy={C} r={R_RIM + 4} fill="#0f212e" />
          <circle
            cx={C}
            cy={C}
            r={R_RIM}
            fill="#1c2f3b"
            stroke="rgba(255,255,255,.08)"
            strokeWidth="2"
          />

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
              const tx = C + R * 0.72 * Math.cos(mid);
              const ty = C + R * 0.72 * Math.sin(mid);
              const lit = settledIdx === i;
              return (
                <g key={i}>
                  <path
                    d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                    fill={colourFor(m, i)}
                    stroke={lit ? "#ffffff" : "rgba(15,33,46,.85)"}
                    strokeWidth={lit ? 2 : 1}
                  />
                  {lit ? (
                    <path
                      d={`M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`}
                      fill="#ffffff"
                      fillOpacity="0.18"
                    />
                  ) : null}
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={m >= 10 ? 9.5 : 8}
                    fontWeight="900"
                    fill={m >= 1 ? "#0f212e" : "#ffffff"}
                    fillOpacity={m > 0 ? 1 : 0.35}
                    transform={`rotate(${(mid * 180) / Math.PI + 90} ${tx} ${ty})`}
                  >
                    {m > 0 ? `${m}×` : "0"}
                  </text>
                </g>
              );
            })}
          </g>

          <circle cx={C} cy={C} r={R_INNER + 5} fill="#0f212e" />
          <circle
            cx={C}
            cy={C}
            r={R_INNER}
            fill="#213743"
            stroke={won == null ? "rgba(255,255,255,.14)" : won ? T.accent : LOSS}
            strokeWidth="1.6"
          />
          <text
            x={C}
            y={C + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={landedMult != null ? 15 : 8}
            fontWeight="900"
            fill={
              landedMult != null
                ? won
                  ? T.accent
                  : LOSS
                : "rgba(255,255,255,.4)"
            }
            letterSpacing={landedMult != null ? 0 : 1.4}
          >
            {landedMult != null ? `${landedMult}×` : risk.toUpperCase()}
          </text>
        </svg>
      </div>

      {/* stat cells */}
      <div className="mt-3 flex items-stretch gap-2">
        <StatCell label="Max" value={`${bestMult.toFixed(2)}×`} tone="accent" />
        <StatCell label="Risk" value={risk.charAt(0).toUpperCase() + risk.slice(1)} />
        <StatCell label="Chance" value={`${chance.toFixed(2)}%`} />
      </div>
    </div>
  );
}
