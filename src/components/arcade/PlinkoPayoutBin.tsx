import { memo } from "react";

export type PlinkoPayoutBinProps = {
  /** slot index — used only for the gradient id */
  index: number;
  label: string;
  color: string;
  textColor: string;
  active?: boolean;
  cx: number;
  x: number;
  width: number;
  colTop: number;
  bodyTop: number;
  colBottom: number;
  pinH: number;
  chipH: number;
  fontSize: number;
};

/** Illuminated arcade payout chamber. Multiplier values come from the server config. */
function PlinkoPayoutBinImpl({
  index,
  label,
  color,
  textColor,
  active,
  cx,
  x,
  width,
  colTop,
  bodyTop,
  colBottom,
  pinH,
  chipH,
  fontSize,
}: PlinkoPayoutBinProps) {
  return (
    <g className={active ? "slot-pop" : undefined}>
      {/* thin neon pin */}
      <rect x={cx - 1} y={colTop} width={2} height={pinH} rx={1} fill={color} opacity={active ? 1 : 0.75} />
      {/* glowing chamber */}
      <rect
        x={x + 1}
        y={bodyTop}
        width={width - 2}
        height={colBottom - bodyTop}
        rx={7}
        fill={`url(#slotG-${index})`}
        opacity={active ? 1 : 0.95}
      />
      <rect
        x={x + 1}
        y={bodyTop}
        width={width - 2}
        height={colBottom - bodyTop}
        rx={7}
        fill="none"
        stroke={color}
        strokeOpacity={active ? 0.95 : 0.35}
        strokeWidth={1}
      />
      {/* dark label plate */}
      <rect
        x={x + 1}
        y={colBottom - chipH}
        width={width - 2}
        height={chipH - 1}
        rx={6}
        fill="rgba(7,9,28,0.82)"
      />
      <text
        x={cx}
        y={colBottom - chipH / 2 + fontSize * 0.36}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill={textColor}
        textLength={label.length * fontSize * 0.62 > width - 6 ? width - 8 : undefined}
        lengthAdjust="spacingAndGlyphs"
        style={{ letterSpacing: 0 }}
      >
        {label}
      </text>
    </g>
  );
}

export const PlinkoPayoutBin = memo(PlinkoPayoutBinImpl);
