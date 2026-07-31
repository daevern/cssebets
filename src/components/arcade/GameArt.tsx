/**
 * Hand-built SVG scenes for the arcade lobby. Each one is a miniature of the
 * real game board so the tile reads as the game, not as a stock gradient.
 */

export function PlinkoArt() {
  const rows = [3, 4, 5, 6, 7];
  const pegs: { x: number; y: number }[] = [];
  rows.forEach((count, r) => {
    const y = 30 + r * 22;
    const spread = 26;
    const startX = 120 - ((count - 1) * spread) / 2;
    for (let i = 0; i < count; i++) pegs.push({ x: startX + i * spread, y });
  });
  const buckets = ["8x", "3x", "1x", "0.4x", "1x", "3x", "8x"];

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Plinko board">
      <defs>
        <radialGradient id="plinkoGlow" cx="50%" cy="10%" r="80%">
          <stop offset="0%" stopColor="var(--color-neon)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-neon)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="170" fill="url(#plinkoGlow)" />

      {/* drop slot */}
      <rect x="108" y="6" width="24" height="8" rx="4" fill="var(--color-neon)" opacity="0.55" />

      {/* falling ball trail */}
      <path
        d="M120 14 C 112 30, 130 42, 122 56 C 112 72, 134 84, 126 100 C 118 116, 150 124, 158 140"
        fill="none"
        stroke="var(--color-neon)"
        strokeWidth="1.6"
        strokeDasharray="3 5"
        opacity="0.6"
      />
      <circle cx="158" cy="140" r="6" fill="var(--color-neon)">
        <animate attributeName="r" values="5;7;5" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="158" cy="140" r="11" fill="var(--color-neon)" opacity="0.2" />

      {pegs.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="currentColor" opacity={0.5} />
      ))}

      {buckets.map((b, i) => {
        const w = 30;
        const x = 120 - (buckets.length * w) / 2 + i * w;
        const hot = i === 0 || i === buckets.length - 1;
        const warm = i === 1 || i === buckets.length - 2;
        return (
          <g key={b + i}>
            <rect
              x={x + 1.5}
              y={148}
              width={w - 3}
              height={18}
              rx="3"
              fill={hot ? "var(--color-neon)" : "currentColor"}
              opacity={hot ? 0.85 : warm ? 0.28 : 0.14}
            />
            <text
              x={x + w / 2}
              y={160.5}
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="800"
              fill={hot ? "var(--color-bg)" : "currentColor"}
              opacity={hot ? 1 : 0.8}
            >
              {b}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RouletteArt() {
  const pockets = 12;
  const colors = ["#d13b3b", "#101418"];
  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Roulette wheel">
      <defs>
        <radialGradient id="rouletteGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="170" fill="url(#rouletteGlow)" />

      <g transform="translate(120 88)">
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="14s"
            repeatCount="indefinite"
          />
          <circle r="62" fill="#0c0f13" stroke="#c9a84c" strokeWidth="3" />
          {Array.from({ length: pockets }).map((_, i) => {
            const a0 = (i / pockets) * Math.PI * 2;
            const a1 = ((i + 1) / pockets) * Math.PI * 2;
            const r = 58;
            const x0 = Math.cos(a0) * r;
            const y0 = Math.sin(a0) * r;
            const x1 = Math.cos(a1) * r;
            const y1 = Math.sin(a1) * r;
            return (
              <path
                key={i}
                d={`M0 0 L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`}
                fill={colors[i % 2]}
                stroke="#c9a84c"
                strokeWidth="0.6"
              />
            );
          })}
          <circle r="26" fill="#15191f" stroke="#c9a84c" strokeWidth="2" />
          <circle r="9" fill="#c9a84c" opacity="0.85" />
        </g>

        {/* ball riding the rim */}
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360"
            to="0"
            dur="3.2s"
            repeatCount="indefinite"
          />
          <circle cx="0" cy="-50" r="5" fill="#fff8e7" />
          <circle cx="0" cy="-50" r="9" fill="#fff8e7" opacity="0.18" />
        </g>

        {/* pointer */}
        <path d="M0 -72 L -6 -62 L 6 -62 Z" fill="#c9a84c" />
      </g>

      {/* chips */}
      <g>
        <circle cx="26" cy="140" r="12" fill="#d13b3b" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="4 4" />
        <circle cx="44" cy="146" r="12" fill="#1f2a37" stroke="#c9a84c" strokeOpacity="0.6" strokeWidth="2.5" strokeDasharray="4 4" />
        <circle cx="62" cy="140" r="12" fill="#c9a84c" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" strokeDasharray="4 4" />
      </g>
    </svg>
  );
}

export function TreasureArt() {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const gems = [6, 12, 18];
  const traps = [8, 16];
  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Treasure grid">
      <defs>
        <radialGradient id="treasureGlow" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="170" fill="url(#treasureGlow)" />

      <g transform="translate(65 16)">
        {cells.map((i) => {
          const col = i % 5;
          const row = Math.floor(i / 5);
          const s = 22;
          const gap = 4;
          const x = col * (s + gap);
          const y = row * (s + gap);
          const isGem = gems.includes(i);
          const isTrap = traps.includes(i);
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={s}
                height={s}
                rx="5"
                fill={isGem ? "#f59e0b" : isTrap ? "#7f1d1d" : "#161b22"}
                fillOpacity={isGem ? 0.9 : isTrap ? 0.85 : 1}
                stroke={isGem ? "#fcd34d" : "currentColor"}
                strokeOpacity={isGem ? 0.9 : 0.18}
                strokeWidth="1.2"
              />
              {isGem && (
                <path
                  d={`M${x + 11} ${y + 5} L${x + 17} ${y + 11} L${x + 11} ${y + 18} L${x + 5} ${y + 11} Z`}
                  fill="#3b1d00"
                  opacity="0.75"
                />
              )}
              {isTrap && (
                <g stroke="#fca5a5" strokeWidth="1.8" strokeLinecap="round">
                  <line x1={x + 7} y1={y + 7} x2={x + 15} y2={y + 15} />
                  <line x1={x + 15} y1={y + 7} x2={x + 7} y2={y + 15} />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* multiplier tag */}
      <g>
        <rect x="14" y="66" width="44" height="22" rx="11" fill="#f59e0b" opacity="0.92" />
        <text x="36" y="81" textAnchor="middle" fontSize="11" fontWeight="900" fill="#2a1500">
          2.4x
        </text>
        <text
          x="36"
          y="100"
          textAnchor="middle"
          fontSize="7"
          fontWeight="800"
          fill="currentColor"
          opacity="0.7"
        >
          CASH OUT
        </text>
      </g>
    </svg>
  );
}
