/**
 * Animated miniatures of the real arcade boards. Each one mirrors the actual
 * in-game UI (same felt, same chips, same tiles, same pedestals) and loops a
 * short demo of the core loop so the lobby tile reads as a live preview.
 */

/* ---------------------------------- Plinko --------------------------------- */

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
  // Bounce path the demo ball follows, landing in the right-hand 3x bucket.
  const ballPath =
    "M120 16 L112 30 L124 52 L114 74 L128 96 L120 118 L138 138 L150 152";

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Plinko board demo">
      <defs>
        <radialGradient id="plinkoGlow" cx="50%" cy="8%" r="85%">
          <stop offset="0%" stopColor="var(--color-neon)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--color-neon)" stopOpacity="0" />
        </radialGradient>
        <path id="plinkoBallPath" d={ballPath} />
      </defs>
      <rect width="240" height="170" fill="#0b0e12" />
      <rect width="240" height="170" fill="url(#plinkoGlow)" />

      {/* drop slot */}
      <rect x="106" y="6" width="28" height="9" rx="4.5" fill="var(--color-neon)" opacity="0.6" />

      {pegs.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="currentColor" opacity={0.45} />
      ))}

      {/* live drop */}
      <g>
        <circle r="6" fill="var(--color-neon)" />
        <circle r="11" fill="var(--color-neon)" opacity="0.18" />
        <animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
          <mpath href="#plinkoBallPath" />
        </animateMotion>
      </g>

      {buckets.map((b, i) => {
        const w = 30;
        const x = 120 - (buckets.length * w) / 2 + i * w;
        const hot = i === 0 || i === buckets.length - 1;
        const warm = i === 1 || i === buckets.length - 2;
        const isHit = i === 5;
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
            >
              {isHit && (
                <animate
                  attributeName="opacity"
                  values="0.28;1;0.28"
                  keyTimes="0;0.06;1"
                  dur="2.6s"
                  repeatCount="indefinite"
                />
              )}
            </rect>
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

/* --------------------------------- Roulette -------------------------------- */

export function RouletteArt() {
  const pockets = 18;
  const reds = new Set([1, 3, 5, 7, 9, 11, 13, 15, 17]);
  const layout = [
    ["3", "6", "9", "12"],
    ["2", "5", "8", "11"],
    ["1", "4", "7", "10"],
  ];

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Roulette table demo">
      <defs>
        <radialGradient id="rltFelt" cx="45%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#12built" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rltFeltG" cx="40%" cy="35%" r="85%">
          <stop offset="0%" stopColor="#1c5c3a" />
          <stop offset="100%" stopColor="#0c2d1d" />
        </radialGradient>
        <radialGradient id="rltWood" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#5a3club" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rltRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8a5a2b" />
          <stop offset="45%" stopColor="#5c3a19" />
          <stop offset="100%" stopColor="#33200e" />
        </linearGradient>
      </defs>

      {/* felt table */}
      <rect width="240" height="170" fill="url(#rltFeltG)" />
      <rect x="4" y="4" width="232" height="162" rx="10" fill="none" stroke="#c9a84c" strokeOpacity="0.4" />

      {/* betting layout on the right */}
      <g transform="translate(150 40)">
        {layout.map((row, r) =>
          row.map((n, c) => {
            const num = Number(n);
            return (
              <g key={n}>
                <rect
                  x={c * 20}
                  y={r * 26}
                  width="19"
                  height="25"
                  rx="2"
                  fill={reds.has(num) ? "#b32431" : "#12181d"}
                  stroke="#c9a84c"
                  strokeOpacity="0.45"
                  strokeWidth="0.7"
                />
                <text
                  x={c * 20 + 9.5}
                  y={r * 26 + 16.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="800"
                  fill="#f6f1e3"
                >
                  {n}
                </text>
              </g>
            );
          }),
        )}
        {/* chip dropping on a number */}
        <g>
          <circle cx="29" cy="38" r="8.5" fill="#c9a84c" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="3.5 3.5" />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 -26; 0 0; 0 0; 0 -26"
            keyTimes="0;0.16;0.86;1"
            dur="5s"
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.16;0.86;1" dur="5s" repeatCount="indefinite" />
        </g>
      </g>

      {/* wheel on the left */}
      <g transform="translate(70 85)">
        <circle r="62" fill="url(#rltRim)" />
        <circle r="62" fill="none" stroke="#2a1a0b" strokeWidth="1.5" />
        <circle r="52" fill="#0c0f13" stroke="#c9a84c" strokeWidth="1.6" />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="9s"
            repeatCount="indefinite"
          />
          {Array.from({ length: pockets }).map((_, i) => {
            const a0 = (i / pockets) * Math.PI * 2;
            const a1 = ((i + 1) / pockets) * Math.PI * 2;
            const r = 50;
            return (
              <path
                key={i}
                d={`M0 0 L ${Math.cos(a0) * r} ${Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`}
                fill={i === 0 ? "#177a4a" : reds.has(i) ? "#b32431" : "#101418"}
                stroke="#c9a84c"
                strokeWidth="0.5"
                strokeOpacity="0.7"
              />
            );
          })}
          <circle r="22" fill="#15191f" stroke="#c9a84c" strokeWidth="1.6" />
          <circle r="8" fill="#c9a84c" opacity="0.9" />
        </g>

        {/* ball riding the rim, counter-rotating */}
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360"
            to="0"
            dur="2.4s"
            repeatCount="indefinite"
          />
          <circle cx="0" cy="-44" r="4.5" fill="#fff8e7" />
          <circle cx="0" cy="-44" r="8" fill="#fff8e7" opacity="0.2" />
        </g>

        <path d="M0 -68 L -5 -59 L 5 -59 Z" fill="#c9a84c" />
      </g>
    </svg>
  );
}

/* ------------------------------ Treasure Grid ------------------------------ */

export function TreasureArt() {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  // reveal order for the looping demo
  const reveals: Record<number, number> = { 12: 0, 6: 1, 18: 2, 11: 3 };
  const trap = 8;
  const DUR = 5;

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Treasure grid demo">
      <defs>
        <radialGradient id="treasureGlow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="170" fill="#0b0e12" />
      <rect width="240" height="170" fill="url(#treasureGlow)" />

      <g transform="translate(78 22)">
        {cells.map((i) => {
          const col = i % 5;
          const row = Math.floor(i / 5);
          const s = 22;
          const gap = 4.5;
          const x = col * (s + gap);
          const y = row * (s + gap);
          const order = reveals[i];
          const isGem = order !== undefined;
          const isTrap = i === trap;
          const begin = isGem ? 0.14 + order * 0.16 : 0.82;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={s}
                height={s}
                rx="5"
                fill="#2b333d"
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth="1.1"
              />
              {(isGem || isTrap) && (
                <g opacity="0">
                  <animate
                    attributeName="opacity"
                    values="0;0;1;1;0"
                    keyTimes={`0;${begin};${begin + 0.05};0.94;1`}
                    dur={`${DUR}s`}
                    repeatCount="indefinite"
                  />
                  <rect
                    x={x}
                    y={y}
                    width={s}
                    height={s}
                    rx="5"
                    fill={isGem ? "#f59e0b" : "#7f1d1d"}
                    stroke={isGem ? "#fcd34d" : "#fca5a5"}
                    strokeOpacity="0.9"
                    strokeWidth="1.2"
                  />
                  {isGem ? (
                    <path
                      d={`M${x + 11} ${y + 5} L${x + 17} ${y + 11} L${x + 11} ${y + 18} L${x + 5} ${y + 11} Z`}
                      fill="#3b1d00"
                      opacity="0.8"
                    />
                  ) : (
                    <g stroke="#fecaca" strokeWidth="1.9" strokeLinecap="round">
                      <line x1={x + 7} y1={y + 7} x2={x + 15} y2={y + 15} />
                      <line x1={x + 15} y1={y + 7} x2={x + 7} y2={y + 15} />
                    </g>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* climbing multiplier badge */}
      <g>
        <rect x="10" y="60" width="52" height="24" rx="12" fill="#f59e0b" opacity="0.95" />
        <text x="36" y="77" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="#2a1500">
          <tspan>
            1.2x
            <animate
              attributeName="opacity"
              values="1;0;0;0;0"
              keyTimes="0;0.3;0.46;0.62;1"
              dur={`${DUR}s`}
              repeatCount="indefinite"
            />
          </tspan>
        </text>
        <text x="36" y="77" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="#2a1500" opacity="0">
          1.9x
          <animate
            attributeName="opacity"
            values="0;1;0;0;0"
            keyTimes="0;0.32;0.46;0.62;1"
            dur={`${DUR}s`}
            repeatCount="indefinite"
          />
        </text>
        <text x="36" y="77" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="#2a1500" opacity="0">
          3.4x
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.46;0.5;0.8;1"
            dur={`${DUR}s`}
            repeatCount="indefinite"
          />
        </text>
        <text x="36" y="97" textAnchor="middle" fontSize="7" fontWeight="800" fill="currentColor" opacity="0.75">
          CASH OUT
        </text>
      </g>
    </svg>
  );
}

/* -------------------------------- Blackjack -------------------------------- */

export function BlackjackArt() {
  const DUR = 5.2;
  // dealer row then player row, dealt alternately from the shoe on the right
  const deal = [
    { x: 62, y: 24, i: 0, face: "A", suit: "\u2660", red: false, hidden: false },
    { x: 62, y: 96, i: 1, face: "K", suit: "\u2665", red: true, hidden: false },
    { x: 96, y: 24, i: 2, face: "", suit: "", red: false, hidden: true },
    { x: 96, y: 96, i: 3, face: "J", suit: "\u2663", red: false, hidden: false },
  ];

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Blackjack table demo">
      <defs>
        <radialGradient id="bjFelt" cx="45%" cy="35%" r="85%">
          <stop offset="0%" stopColor="#1c5c3a" />
          <stop offset="100%" stopColor="#0b2a1a" />
        </radialGradient>
      </defs>
      <rect width="240" height="170" fill="url(#bjFelt)" />
      <path d="M6 156 A 118 100 0 0 1 234 156" fill="none" stroke="#c9a84c" strokeOpacity="0.45" strokeWidth="1.3" />
      <text x="86" y="16" textAnchor="middle" fontSize="8" fontWeight="900" letterSpacing="2.6" fill="#e8dfc4" opacity="0.7">
        BLACKJACK PAYS 3:2
      </text>

      {/* shoe / deck on the right */}
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${196 + k * 3} ${58 - k * 3})`}>
          <rect width="34" height="48" rx="4" fill="#0d1a24" stroke="#c9a84c" strokeOpacity="0.55" />
          <rect x="4" y="4" width="26" height="40" rx="3" fill="none" stroke="#c9a84c" strokeOpacity="0.35" />
          <text x="17" y="27" textAnchor="middle" fontSize="7" fontWeight="900" fill="#c9a84c" opacity="0.85">
            CSSE
          </text>
        </g>
      ))}

      {deal.map((c) => {
        const t0 = 0.08 + c.i * 0.11; // leaves the shoe
        const t1 = t0 + 0.09; // lands
        const t2 = t1 + 0.07; // flipped
        const dx = 196 - c.x;
        const dy = 58 - c.y;
        return (
          <g key={c.i} opacity="0">
            <animate
              attributeName="opacity"
              values="0;1;1;1"
              keyTimes={`0;${t0};0.94;1`}
              dur={`${DUR}s`}
              repeatCount="indefinite"
            />
            <g transform={`translate(${c.x} ${c.y})`}>
              <g>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`${dx} ${dy}; ${dx} ${dy}; 0 0; 0 0`}
                  keyTimes={`0;${t0};${t1};1`}
                  dur={`${DUR}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0 0 1 1;.18 .72 .28 1;0 0 1 1"
                />
                {/* back */}
                <g>
                  <animate
                    attributeName="opacity"
                    values="1;1;0;0"
                    keyTimes={`0;${t1};${c.hidden ? 0.99 : t2};1`}
                    dur={`${DUR}s`}
                    repeatCount="indefinite"
                  />
                  <rect width="34" height="48" rx="4" fill="#0d1a24" stroke="#c9a84c" strokeOpacity="0.55" />
                  <rect x="4" y="4" width="26" height="40" rx="3" fill="none" stroke="#c9a84c" strokeOpacity="0.35" />
                  <text x="17" y="27" textAnchor="middle" fontSize="7" fontWeight="900" fill="#c9a84c" opacity="0.85">
                    CSSE
                  </text>
                </g>
                {/* face */}
                {!c.hidden && (
                  <g opacity="0">
                    <animate
                      attributeName="opacity"
                      values="0;0;1;1"
                      keyTimes={`0;${t2};${t2 + 0.02};1`}
                      dur={`${DUR}s`}
                      repeatCount="indefinite"
                    />
                    <rect width="34" height="48" rx="4" fill="#f7f7f2" stroke="#0d1a24" strokeOpacity="0.5" />
                    <text x="5" y="15" fontSize="11" fontWeight="900" fill={c.red ? "#d92b3a" : "#101418"}>
                      {c.face}
                    </text>
                    <text x="17" y="35" textAnchor="middle" fontSize="15" fill={c.red ? "#d92b3a" : "#101418"}>
                      {c.suit}
                    </text>
                  </g>
                )}
              </g>
            </g>
          </g>
        );
      })}

      {/* chip stack in the betting circle */}
      <circle cx="30" cy="120" r="18" fill="none" stroke="#c9a84c" strokeOpacity="0.5" strokeDasharray="3 4" />
      <circle cx="30" cy="122" r="10" fill="#b32431" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3.5 3.5" />
      <circle cx="30" cy="116" r="10" fill="#c9a84c" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="3.5 3.5" />
    </svg>
  );
}

/* ---------------------------- Rock–Paper–Scissors --------------------------- */

function RpsGlyph({ kind }: { kind: "rock" | "paper" | "scissors" }) {
  return (
    <g fill="none" stroke="#f2f6fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "rock" && (
        <>
          <rect x="5" y="9" width="20" height="13" rx="6" />
          <path d="M9 14h13M9 18h13" strokeWidth="1.5" />
        </>
      )}
      {kind === "paper" && (
        <>
          <rect x="8" y="5" width="15" height="21" rx="2.5" />
          <path d="M12 11h8M12 15h8M12 19h5" strokeWidth="1.5" />
        </>
      )}
      {kind === "scissors" && (
        <>
          <path d="M9 6l10 15M22 6L12 21" />
          <circle cx="10" cy="25" r="3" />
          <circle cx="21" cy="25" r="3" />
        </>
      )}
    </g>
  );
}

export function RpsArt() {
  const DUR = 4.4;
  const pads: { x: number; kind: "rock" | "paper" | "scissors"; pick: boolean }[] = [
    { x: 28, kind: "rock", pick: false },
    { x: 100, kind: "paper", pick: true },
    { x: 172, kind: "scissors", pick: false },
  ];

  return (
    <svg viewBox="0 0 240 170" className="h-full w-full" role="img" aria-label="Rock paper scissors demo">
      <rect width="240" height="170" fill="#0b0e12" />

      {/* server output box */}
      <g>
        <rect x="82" y="14" width="76" height="46" rx="6" fill="#111820" stroke="#22d3ee" strokeOpacity="0.5" />
        <text x="120" y="27" textAnchor="middle" fontSize="6.5" fontWeight="900" letterSpacing="1.6" fill="#22d3ee" opacity="0.8">
          SERVER
        </text>
        <g transform="translate(105 30)">
          <g opacity="1">
            <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.5;0.56;0.94;1" dur={`${DUR}s`} repeatCount="indefinite" />
            <rect width="30" height="26" rx="4" fill="#0b1116" stroke="#22d3ee" strokeOpacity="0.35" />
            <text x="15" y="19" textAnchor="middle" fontSize="14" fontWeight="900" fill="#22d3ee">
              ?
            </text>
          </g>
          <g opacity="0" transform="translate(1 -1)">
            <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.5;0.56;0.94;1" dur={`${DUR}s`} repeatCount="indefinite" />
            <rect width="30" height="26" rx="4" fill="#0b1116" stroke="#22d3ee" strokeOpacity="0.5" />
            <g transform="translate(1 0) scale(0.93)">
              <RpsGlyph kind="rock" />
            </g>
          </g>
        </g>
      </g>

      {/* wiring from output box down to the pedestals */}
      <g fill="none" stroke="#5c6b7c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M120 60 V72" />
        <path d="M48 100 V78 Q48 72 54 72 H186 Q192 72 192 78 V100" />
      </g>

      {/* pedestal buttons */}
      {pads.map(({ x, kind, pick }) => (
        <g key={kind} transform={`translate(${x} 96)`}>
          {/* cradle arms */}
          <rect x="0" y="6" width="6" height="34" rx="3" fill={pick ? "#e6ecf2" : "#77879a"}>
            {pick && (
              <animate attributeName="fill" values="#77879a;#e6ecf2;#e6ecf2;#77879a" keyTimes="0;0.36;0.94;1" dur={`${DUR}s`} repeatCount="indefinite" />
            )}
          </rect>
          <rect x="34" y="6" width="6" height="34" rx="3" fill={pick ? "#e6ecf2" : "#77879a"}>
            {pick && (
              <animate attributeName="fill" values="#77879a;#e6ecf2;#e6ecf2;#77879a" keyTimes="0;0.36;0.94;1" dur={`${DUR}s`} repeatCount="indefinite" />
            )}
          </rect>
          {/* green tile */}
          <rect x="4" y="2" width="32" height="34" rx="4" fill="var(--color-neon)" />
          <rect x="7.5" y="5" width="25" height="28" rx="3" fill="#0d1218" />
          <g transform="translate(9.5 6.5) scale(0.78)">
            <RpsGlyph kind={kind} />
          </g>
          {/* base slab */}
          <rect x="-2" y="40" width="44" height="9" rx="3" fill="#8b9aab" />
        </g>
      ))}

      <text x="120" y="164" textAnchor="middle" fontSize="7.5" fontWeight="900" letterSpacing="1.4" fill="#8fa2b4">
        COMMITTED BEFORE YOU PICK
      </text>
    </svg>
  );
}
