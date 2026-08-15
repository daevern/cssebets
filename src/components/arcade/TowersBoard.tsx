import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import {
  TOWERS_DIFFICULTIES,
  towersMultiplierAt,
  towersSafeChance,
  type TowersDifficulty,
} from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.towers;
const LOSS = "#ff4d5e";

function DragonGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M3 14c3-6 8-8 13-8l2-3 1 4 2 1-3 2c0 5-4 8-9 8H4l2-2-3-2Z"
        fill={color}
      />
      <circle cx="15" cy="7.5" r="1" fill="#0f212e" />
    </svg>
  );
}

/**
 * Dragon Towers playfield — eight rows climbed bottom-up. Presentation only:
 * the server owns the dragon layout and every multiplier shown here mirrors
 * the published maths.
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

  return (
    <div
      className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[10px] px-3 pb-3 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="flex flex-col gap-1.5">
        {order.map((row) => {
          const done = row < currentRow;
          const live = active && row === currentRow;
          const rowMultiplier = towersMultiplierAt(difficulty, row + 1);
          const dragons = tower?.[row] ?? revealed[row] ?? null;
          const picked = picks[row];

          return (
            <div key={row} className="flex items-center gap-2">
              <span
                className="w-12 shrink-0 text-right font-display text-[10px] font-black tabular-nums"
                style={{
                  color: done ? T.accent : live ? "#ffffff" : "rgba(255,255,255,.32)",
                }}
              >
                {rowMultiplier.toFixed(2)}×
              </span>
              <div
                className="grid flex-1 gap-1.5"
                style={{ gridTemplateColumns: `repeat(${shape.tiles}, minmax(0,1fr))` }}
              >
                {Array.from({ length: shape.tiles }, (_, tile) => {
                  const isDragon = dragons?.includes(tile) ?? false;
                  const isPick = picked === tile;
                  const bust = bustedRow === row && isPick;
                  const safePick = done && isPick;
                  const clickable = Boolean(live) && !disabled;

                  return (
                    <button
                      key={tile}
                      type="button"
                      disabled={!clickable}
                      onClick={() => onPick(tile)}
                      aria-label={`Row ${row + 1}, tile ${tile + 1}`}
                      className={cn(
                        "grid h-8 place-items-center rounded-[6px] border font-display text-[11px] font-black transition-transform",
                        clickable && "active:scale-95",
                        live && "motion-safe:animate-pulse",
                        bust && "motion-safe:[animation:kenoHitPop_320ms_ease-out]",
                      )}
                      style={{
                        background: bust
                          ? LOSS
                          : safePick
                            ? T.accent
                            : isDragon
                              ? "rgba(255,77,94,.16)"
                              : live
                                ? "#0f212e"
                                : "#1b2f3c",
                        borderColor: bust
                          ? LOSS
                          : safePick
                            ? T.accent
                            : live
                              ? T.accent
                              : isDragon
                                ? "rgba(255,77,94,.35)"
                                : "rgba(255,255,255,.06)",
                        color: safePick ? "#03210a" : "#ffffff",
                        opacity: done || live || dragons ? 1 : 0.55,
                      }}
                    >
                      {isDragon ? (
                        <DragonGlyph color={bust ? "#3b0710" : LOSS} />
                      ) : safePick ? (
                        "✓"
                      ) : (
                        ""
                      )}
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
          { label: "Difficulty", value: shape.label },
          { label: "Safe odds", value: `${(towersSafeChance(difficulty) * 100).toFixed(0)}%` },
          { label: "Row", value: `${Math.min(currentRow + (active ? 1 : 0), rows)}/${rows}` },
          {
            label: "Multiplier",
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
