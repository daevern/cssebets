import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import {
  TOWERS_DIFFICULTIES,
  towersMultiplierAt,
  towersSafeChance,
  type TowersDifficulty,
} from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.towers;

const SAFE = "#2ee83f";
const SAFE_DEEP = "#17b527";
const BUST = "#c0142c";
const STONE = "#2a3a4a";
const STONE_DEEP = "#22303e";

/** Cream dragon egg with speckles — revealed on a tile you cleared safely. */
function DragonEgg({ delay = 0 }: { delay?: number }) {
  return (
    <svg
      viewBox="0 0 24 30"
      className="h-[26px] w-[21px] motion-safe:[animation:towersEggPop_320ms_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    >
      <ellipse cx="12" cy="18" rx="11" ry="12" fill="#f3ece1" />
      <path d="M12 6c5 3 8 7.5 8 12a8 8 0 0 1-1 4c1.5-8-2.5-13-7-16Z" fill="#d9d0c2" />
      <path d="M12 6C7 9 4 13.5 4 18c0 1.4.3 2.7.8 3.9C3.4 14 7.5 9 12 6Z" fill="#ffffff" />
      <g fill="#b9ae9c" opacity=".85">
        <circle cx="9" cy="14" r="1.1" />
        <circle cx="14.5" cy="17" r="1.4" />
        <circle cx="10.5" cy="21" r="1.2" />
        <circle cx="15" cy="23.5" r="0.9" />
        <circle cx="7.5" cy="19" r="0.7" />
      </g>
    </svg>
  );
}

/** Dim dragon skull marker — where a dragon was hiding (shown once settled). */
function DragonMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] opacity-70" aria-hidden>
      <path
        d="M12 3c4.4 0 7.5 2.9 7.5 6.7 0 2.6-1.4 4.3-3 5.4l.4 3-2.6-1.3-2.3.9-2.3-.9L7.1 18l.4-3c-1.6-1.1-3-2.8-3-5.4C4.5 5.9 7.6 3 12 3Z"
        fill="#7d2230"
      />
      <circle cx="9.4" cy="10" r="1.6" fill="#ff6b3d" />
      <circle cx="14.6" cy="10" r="1.6" fill="#ff6b3d" />
    </svg>
  );
}


/** Fire bomb / explosion that erupts on the tile you got wrong. */
function FireBlast() {
  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center overflow-visible">
      {/* shock ring */}
      <span
        className="absolute h-10 w-10 rounded-full motion-safe:[animation:towersBoom_420ms_ease-out_both]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,236,150,.95) 0%, rgba(255,138,32,.75) 42%, rgba(214,20,44,0) 72%)",
        }}
      />
      {/* embers */}
      {[-14, -6, 4, 13].map((x, i) => (
        <span
          key={x}
          className="absolute h-1 w-1 rounded-full motion-safe:[animation:towersEmberRise_720ms_ease-out_both]"
          style={{
            left: `calc(50% + ${x}px)`,
            background: i % 2 ? "#ffd166" : "#ff7b29",
            animationDelay: `${120 + i * 70}ms`,
          }}
        />
      ))}
      {/* flame + bomb */}
      <svg
        viewBox="0 0 24 24"
        className="relative h-[22px] w-[22px] motion-safe:[animation:towersFlameFlicker_520ms_ease-in-out_infinite]"
        aria-hidden
      >
        <path
          d="M12 2c1.2 3.3-.6 4.6-1.9 6.2-1.4 1.7-2.6 3-2.6 5.4A6.5 6.5 0 0 0 18.5 14c0-3.4-2-5-3.2-6.7-.5 1-1.3 1.6-2 1.9.6-2.6.3-5.2-1.3-7.2Z"
          fill="#ffb01f"
        />
        <path
          d="M12 10c.9 1.6.2 2.4-.6 3.4-.7.9-1.1 1.6-1.1 2.6a2.9 2.9 0 0 0 5.7.3c0-1.9-1.4-3.6-4-6.3Z"
          fill="#fff0b8"
        />
      </svg>
    </span>
  );
}

/** Stone battlement crown that caps the keep (no dragon). */
function CastleCrown() {
  return (
    <div className="relative -mx-3 -mt-3 mb-2 h-[64px] overflow-hidden rounded-t-[14px]">
      <svg viewBox="0 0 360 64" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <linearGradient id="twStone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d8b9c" />
            <stop offset="1" stopColor="#4c5b6d" />
          </linearGradient>
          <linearGradient id="twSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#152232" />
            <stop offset="1" stopColor="#0d1826" />
          </linearGradient>
        </defs>
        <rect width="360" height="64" fill="url(#twSky)" />
        <circle cx="300" cy="16" r="11" fill="#22344a" opacity=".8" />
        {/* towers on both flanks */}
        <g fill="url(#twStone)" opacity=".9">
          <rect x="12" y="18" width="30" height="28" rx="2" />
          <rect x="318" y="18" width="30" height="28" rx="2" />
          <path d="M12 18l15-10 15 10Z" />
          <path d="M318 18l15-10 15 10Z" />
        </g>
        {/* battlements */}
        <g fill="url(#twStone)">
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={4 + i * 30} y={34} width="22" height="14" rx="2" />
          ))}
          <rect x="0" y="46" width="360" height="18" rx="3" />
        </g>
        <rect x="0" y="46" width="360" height="4" fill="#93a1b2" opacity=".55" />
      </svg>
    </div>
  );
}


/**
 * Dragon Towers playfield — eight rows climbed bottom-up inside a stone keep.
 * Presentation only: the server owns the dragon layout and every multiplier
 * shown here mirrors the published maths.
 */
export function TowersBoard({
  difficulty,
  rows,
  currentRow,
  picks,
  revealed,
  tower,
  bustedRow,
  multiplier,
  onPick,
  disabled,
  active,
}: {
  difficulty: TowersDifficulty;
  rows: number;
  /** How many rows have already been climbed (0 = row 1 is live). */
  currentRow: number;
  /** Tile index chosen on each completed row. */
  picks: number[];
  /** Dragon tiles revealed on each completed row. */
  revealed: number[][];
  /** Full dragon layout, only sent once the round settles. */
  tower: number[][] | null;
  bustedRow: number | null;
  multiplier: number;
  onPick: (tile: number) => void;
  disabled?: boolean;
  /** True while a climb is in flight. */
  active?: boolean;
}) {
  const shape = TOWERS_DIFFICULTIES[difficulty];
  const order = Array.from({ length: rows }, (_, i) => rows - 1 - i);

  // Fire the shake/scorch flash once, the moment a dragon bites.
  const [boom, setBoom] = useState(false);
  const lastBust = useRef<number | null>(null);
  useEffect(() => {
    if (bustedRow != null && lastBust.current !== bustedRow) {
      lastBust.current = bustedRow;
      setBoom(true);
      const t = setTimeout(() => setBoom(false), 700);
      return () => clearTimeout(t);
    }
    if (bustedRow == null) lastBust.current = null;
  }, [bustedRow]);

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[14px] px-3 pb-3 pt-3",
        boom && "motion-safe:[animation:towersShake_420ms_ease-in-out]",
      )}
      style={{
        background: `linear-gradient(180deg, #16202c 0%, ${T.feltOrBoardFill} 40%)`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.05)",
      }}
    >
      <CastleCrown />


      {/* scorch flash over the whole keep */}
      {boom && (
        <span
          className="pointer-events-none absolute inset-0 z-20 motion-safe:[animation:towersScorchFlash_620ms_ease-out_both]"
          style={{
            background:
              "radial-gradient(circle at 50% 60%, rgba(255,140,40,.55), rgba(192,20,44,.25) 45%, transparent 72%)",
          }}
        />
      )}

      <div
        className="relative flex flex-col gap-[5px] rounded-[10px] p-[6px]"
        style={{ background: "#16202c", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.04)" }}
      >
        {order.map((row) => {
          const done = row < currentRow;
          const live = active && row === currentRow;
          const rowMultiplier = towersMultiplierAt(difficulty, row + 1);
          const dragons = tower?.[row] ?? revealed[row] ?? null;
          const picked = picks[row];
          const isBustRow = bustedRow === row;

          return (
            <div key={row} className="flex items-center gap-2">
              <span
                className="w-12 shrink-0 text-right font-display text-[12px] font-black tabular-nums"
                style={{
                  color: done ? SAFE : live ? "#ffffff" : "rgba(255,255,255,.3)",
                }}
              >
                {rowMultiplier.toFixed(2)}×
              </span>
              <div
                className={cn(
                  "grid flex-1 gap-[6px]",
                  live && "motion-safe:[animation:towersRowLight_1.6s_ease-in-out_infinite]",
                )}
                style={{ gridTemplateColumns: `repeat(${shape.tiles}, minmax(0,1fr))` }}
              >

                {Array.from({ length: shape.tiles }, (_, tile) => {
                  const isDragon = dragons?.includes(tile) ?? false;
                  const isPick = picked === tile;
                  const bust = isBustRow && isPick;
                  const safePick = done && isPick && !bust;
                  const clickable = Boolean(live) && !disabled;
                  const settled = Boolean(tower) || isBustRow;
                  // Dragons that were never picked are only unmasked once settled.
                  const showDragonMark = isDragon && !bust && settled;

                  const base = safePick
                    ? `linear-gradient(180deg, ${SAFE} 0%, ${SAFE_DEEP} 100%)`
                    : bust
                      ? `linear-gradient(180deg, #e5233c 0%, ${BUST} 100%)`
                      : `linear-gradient(180deg, ${STONE} 0%, ${STONE_DEEP} 100%)`;

                  return (
                    <button
                      key={tile}
                      type="button"
                      disabled={!clickable}
                      onClick={() => onPick(tile)}
                      aria-label={`Row ${row + 1}, tile ${tile + 1}`}
                      className={cn(
                        "relative grid h-12 place-items-center overflow-visible rounded-[6px] transition-transform duration-150",
                        clickable && "hover:brightness-125 active:scale-95",
                        (safePick || showDragonMark || bust) &&
                          "motion-safe:[animation:towersTileReveal_280ms_ease-out_both]",
                      )}
                      style={{
                        background: base,
                        border: live
                          ? `1px solid rgba(46,232,63,.75)`
                          : "1px solid rgba(255,255,255,.05)",
                        boxShadow: live
                          ? "inset 0 -3px 0 rgba(0,0,0,.28), inset 0 0 14px rgba(46,232,63,.18), 0 0 12px rgba(46,232,63,.22)"
                          : bust
                            ? "inset 0 -3px 0 rgba(0,0,0,.35), 0 0 18px rgba(224,35,60,.5)"
                            : "inset 0 -3px 0 rgba(0,0,0,.32)",
                        opacity: done || live || bust || settled ? 1 : 0.9,
                      }}
                    >
                      {/* dragon-scale texture */}
                      <span
                        className="pointer-events-none absolute inset-0 rounded-[6px] opacity-[.22]"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, rgba(0,0,0,.3) 0 1px, transparent 1px 7px)",
                        }}
                      />
                      {safePick ? <DragonEgg /> : null}
                      {showDragonMark ? <DragonMark /> : null}
                      {bust ? <FireBlast /> : null}
                    </button>
                  );
                })}

              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        {[
          { label: "Level", value: shape.label },
          { label: "Safe", value: `${(towersSafeChance(difficulty) * 100).toFixed(0)}%` },
          { label: "Row", value: `${Math.min(currentRow + (active ? 1 : 0), rows)}/${rows}` },
          {
            label: "Mult",
            value: multiplier > 0 ? `${multiplier.toFixed(2)}×` : "—",
            accent: multiplier > 1,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex min-w-0 flex-1 flex-col gap-1 rounded-[6px] border px-2.5 py-2"
            style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
          >
            <span className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
              {s.label}
            </span>
            <span
              className="truncate font-display text-[14px] font-black tabular-nums leading-none"
              style={{ color: s.accent ? T.accent : "#ffffff" }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
