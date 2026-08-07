import { memo } from "react";

/** Luminous Plinko peg (SVG, rendered inside the board's <svg>). */
function PlinkoPegImpl({
  cx,
  cy,
  r,
  active,
}: {
  cx: number;
  cy: number;
  r: number;
  active?: boolean;
}) {
  return (
    <g>
      {active && (
        <circle
          cx={cx}
          cy={cy}
          r={r * 3}
          fill="url(#pegBurst)"
          className="[transform-origin:center] [animation:pegFlash_320ms_ease-out_forwards]"
        />
      )}
      <circle cx={cx} cy={cy + r * 0.35} r={r} fill="rgba(10,6,40,0.55)" />
      <circle cx={cx} cy={cy} r={r} fill="url(#pegBody)" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#7fe4ff" strokeOpacity={active ? 0.9 : 0.28} strokeWidth={0.8} />
      <circle
        cx={cx - r * 0.28}
        cy={cy - r * 0.32}
        r={r * 0.36}
        fill="rgba(255,255,255,0.9)"
        opacity={active ? 1 : 0.62}
      />
      {active && <circle cx={cx} cy={cy} r={r * 1.35} fill="rgba(255,255,255,0.5)" />}
    </g>
  );
}

export const PlinkoPeg = memo(PlinkoPegImpl);
