import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { diceMultiplier, diceWinChance, type DiceDirection } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.dice;

/**
 * Dice playfield: the 0–100 track with the target marker, the winning band
 * and the last server roll. Presentation only.
 */
export function DiceBoard({
  target,
  direction,
  roll,
  rolling,
}: {
  target: number;
  direction: DiceDirection;
  roll: number | null;
  rolling: boolean;
}) {
  const chance = diceWinChance(target, direction) * 100;
  const mult = diceMultiplier(target, direction);
  const won = roll == null ? null : direction === "under" ? roll < target : roll >= target;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-4 px-3 py-2">
      {/* roll read-out */}
      <div
        className="grid h-24 w-full place-items-center rounded-[12px] border"
        style={{
          background: T.feltOrBoardFill,
          borderColor: won == null ? T.hud.plaqueBorder : won ? T.accent : "rgba(255,120,120,.5)",
        }}
      >
        <div
          className={`font-display text-4xl font-black tabular-nums ${rolling ? "animate-pulse" : ""}`}
          style={{
            color: roll == null ? "var(--color-ink-muted)" : won ? T.accent : "#ff8a8a",
          }}
        >
          {rolling ? "—.—" : roll == null ? "00.00" : roll.toFixed(2)}
        </div>
      </div>

      {/* track */}
      <div className="w-full">
        <div
          className="relative h-5 w-full overflow-hidden rounded-full border"
          style={{ background: "rgba(0,0,0,.45)", borderColor: T.hud.plaqueBorder }}
        >
          <div
            className="absolute inset-y-0"
            style={{
              left: direction === "under" ? 0 : `${target}%`,
              width: direction === "under" ? `${target}%` : `${100 - target}%`,
              background: T.accent,
              opacity: 0.5,
            }}
          />
          <div
            className="absolute -top-1 h-7 w-1.5 rounded-full"
            style={{ left: `calc(${target}% - 3px)`, background: T.accent }}
          />
          {roll != null && !rolling && (
            <div
              className="absolute -top-2 h-9 w-0.5"
              style={{ left: `${roll}%`, background: won ? "#ffffff" : "#ff8a8a" }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold tabular-nums text-[var(--color-ink-muted)]">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {/* odds plaques */}
      <div className="grid w-full grid-cols-3 gap-2">
        {[
          { label: "Target", value: `${direction === "under" ? "<" : "≥"} ${target.toFixed(2)}` },
          { label: "Win chance", value: `${chance.toFixed(2)}%` },
          { label: "Payout", value: `${mult.toFixed(2)}×` },
        ].map((p) => (
          <div
            key={p.label}
            className="rounded-[8px] border px-2 py-1.5 text-center"
            style={{ background: T.hud.plaqueBg, borderColor: T.hud.plaqueBorder }}
          >
            <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              {p.label}
            </div>
            <div
              className="font-display text-sm font-black tabular-nums"
              style={{ color: T.accent }}
            >
              {p.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
