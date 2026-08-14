/**
 * Flat 2D cabinet art for the three CSSE Originals mini tables.
 * Presentation only — reused by the lobby tiles and the rules dialog.
 */

export function HiloArt() {
  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Hi-Lo demo">
      <rect width="240" height="170" fill="#120c07" />
      <g transform="translate(66 34)">
        <rect width="60" height="86" rx="7" fill="#1e1409" stroke="#f2a65a" strokeOpacity="0.4" />
        <path d="M14 14h32M14 24h20" stroke="#f2a65a" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
        <circle cx="30" cy="48" r="14" fill="#f2a65a" fillOpacity="0.18" />
        <text x="30" y="54" textAnchor="middle" fontSize="18" fontWeight="900" fill="#f2a65a">
          ?
        </text>
      </g>
      <g transform="translate(132 26)">
        <rect width="60" height="86" rx="7" fill="#f7efdd" />
        <text x="14" y="24" fontSize="15" fontWeight="900" fill="#c8102e">
          9
        </text>
        <path d="M30 44c6-9 18-4 12 5-3 5-12 12-12 12s-9-7-12-12c-6-9 6-14 12-5z" fill="#c8102e" />
      </g>
      <g fill="#f2a65a">
        <path d="M40 62l10-14 10 14z" />
        <path d="M40 108l10 14 10-14z" opacity="0.45" />
      </g>
      <rect x="66" y="132" width="126" height="14" rx="7" fill="#1e1409" stroke="#f2a65a" strokeOpacity="0.25" />
      <rect x="66" y="132" width="72" height="14" rx="7" fill="#f2a65a" fillOpacity="0.35" />
    </svg>
  );
}

export function DiceArt() {
  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Dice demo">
      <rect width="240" height="170" fill="#06120e" />
      <g transform="translate(92 22)">
        <rect width="56" height="56" rx="12" fill="#f4fff9" />
        <g fill="#06120e">
          <circle cx="16" cy="16" r="5" />
          <circle cx="40" cy="16" r="5" />
          <circle cx="28" cy="28" r="5" />
          <circle cx="16" cy="40" r="5" />
          <circle cx="40" cy="40" r="5" />
        </g>
      </g>
      <g transform="translate(24 100)">
        <rect width="192" height="16" rx="8" fill="#0c2019" stroke="#4ade9a" strokeOpacity="0.25" />
        <rect width="116" height="16" rx="8" fill="#4ade9a" fillOpacity="0.55" />
        <rect x="108" y="-6" width="16" height="28" rx="5" fill="#4ade9a" />
      </g>
      <text x="120" y="146" textAnchor="middle" fontSize="11" fontWeight="900" letterSpacing="3" fill="#4ade9a" opacity="0.75">
        ROLL UNDER
      </text>
    </svg>
  );
}

export function WheelArt() {
  const segs = Array.from({ length: 20 }, (_, i) => i);
  const cx = 120;
  const cy = 96;
  const r = 62;
  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Fortune wheel demo">
      <rect width="240" height="170" fill="#140810" />
      <circle cx={cx} cy={cy} r={r + 6} fill="#221019" />
      {segs.map((i) => {
        const a0 = (i / 20) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / 20) * Math.PI * 2 - Math.PI / 2;
        const p = (a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`}
            fill={i % 2 === 0 ? "#ff6b6b" : "#f6e2b3"}
            fillOpacity={i % 2 === 0 ? 0.9 : 0.85}
          />
        );
      })}
      <circle cx={cx} cy={cy} r="14" fill="#140810" stroke="#ff6b6b" strokeOpacity="0.5" />
      <path d={`M${cx - 8} ${cy - r - 12} L${cx + 8} ${cy - r - 12} L${cx} ${cy - r + 2} Z`} fill="#ff6b6b" />
    </svg>
  );
}
