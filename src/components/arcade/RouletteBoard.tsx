import { useState } from "react";
import {
  BOARD_GRID,
  COLUMNS,
  FOUR_GROUPS,
  STREETS,
  LOW,
  HIGH,
  ODD,
  EVEN,
  RED_POCKETS,
  BLACK_POCKETS,
  areAdjacent,
  pocketColour,
  returnMultiplier,
  type BetTypeKey,
} from "@/lib/arcade/roulette-math";
import { cn } from "@/lib/utils";

export type PlaceBet = (betType: BetTypeKey, label: string, pockets: number[]) => void;

const cellBase =
  "relative grid place-items-center rounded-xl border text-[13px] font-display font-bold tabular-nums transition-all active:scale-[0.97] disabled:opacity-40";

function Stack({ amount }: { amount?: number }) {
  if (!amount) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-neon)] px-1 text-[9px] font-bold text-black shadow-[0_0_10px_rgba(var(--neon-glow-rgb),0.6)]">
      {amount}
    </span>
  );
}

export function RouletteBoard({
  stakes,
  onPlace,
  disabled,
}: {
  /** positionKey -> total staked */
  stakes: Record<string, number>;
  onPlace: PlaceBet;
  disabled?: boolean;
}) {
  const [splitMode, setSplitMode] = useState(false);
  const [splitFirst, setSplitFirst] = useState<number | null>(null);

  const amt = (key: string) => stakes[key];

  const handleNumber = (n: number) => {
    if (!splitMode || n === 0) {
      onPlace("straight", `Straight ${n}`, [n]);
      return;
    }
    if (splitFirst == null) {
      setSplitFirst(n);
      return;
    }
    if (splitFirst === n) {
      setSplitFirst(null);
      return;
    }
    if (areAdjacent(splitFirst, n)) {
      const pair = [splitFirst, n].sort((a, b) => a - b);
      onPlace("split", `Split ${pair[0]}/${pair[1]}`, pair);
      setSplitFirst(null);
    } else {
      setSplitFirst(n);
    }
  };

  const outside: { key: BetTypeKey; label: string; pockets: number[]; tone: string }[] = [
    { key: "red", label: "Red", pockets: RED_POCKETS, tone: "border-[#e0374a]/60 text-[#ff6b7a]" },
    {
      key: "black",
      label: "Black",
      pockets: BLACK_POCKETS,
      tone: "border-[var(--color-surface-border)] text-[var(--color-ink)]",
    },
    {
      key: "odd",
      label: "Odd",
      pockets: ODD,
      tone: "border-[var(--color-surface-border)] text-[var(--color-ink)]",
    },
    {
      key: "even",
      label: "Even",
      pockets: EVEN,
      tone: "border-[var(--color-surface-border)] text-[var(--color-ink)]",
    },
    {
      key: "low",
      label: "1–6",
      pockets: LOW,
      tone: "border-[var(--color-surface-border)] text-[var(--color-ink)]",
    },
    {
      key: "high",
      label: "7–12",
      pockets: HIGH,
      tone: "border-[var(--color-surface-border)] text-[var(--color-ink)]",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          Betting board
        </span>
        <button
          type="button"
          onClick={() => {
            setSplitMode((v) => !v);
            setSplitFirst(null);
          }}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] transition-colors",
            splitMode
              ? "border-[var(--color-neon)] bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
              : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]",
          )}
        >
          {splitMode
            ? splitFirst == null
              ? "Split · pick 1st"
              : `Split · ${splitFirst} + ?`
            : "Split"}
        </button>
      </div>

      <div className="flex gap-1.5">
        {/* Zero */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleNumber(0)}
          className={cn(
            cellBase,
            "w-11 shrink-0 border-[var(--color-neon)]/50 bg-[var(--color-neon)]/12 text-[var(--color-neon)]",
          )}
        >
          0
          <Stack amount={amt("straight:0")} />
        </button>

        {/* Numbers 1..12 with street buttons */}
        <div className="flex-1 space-y-1.5">
          {BOARD_GRID.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((n) => {
                const colour = pocketColour(n);
                const selected = splitFirst === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleNumber(n)}
                    className={cn(
                      cellBase,
                      "h-11 flex-1",
                      colour === "red"
                        ? "border-[#e0374a]/60 bg-[#e0374a]/15 text-[#ff6b7a]"
                        : "border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]",
                      selected && "ring-2 ring-[var(--color-neon)]",
                    )}
                  >
                    {n}
                    <Stack amount={amt(`straight:${n}`)} />
                  </button>
                );
              })}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onPlace("street", `Street ${STREETS[ri][0]}–${STREETS[ri][2]}`, STREETS[ri])
                }
                className={cn(
                  cellBase,
                  "h-11 w-11 shrink-0 border-dashed border-[var(--color-surface-border)] text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]",
                )}
              >
                4×
                <Stack amount={amt(`street:${STREETS[ri].join("-")}`)} />
              </button>
            </div>
          ))}

          {/* Columns */}
          <div className="flex gap-1.5">
            {COLUMNS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={disabled}
                onClick={() => onPlace("column", c.label, c.pockets)}
                className={cn(
                  cellBase,
                  "h-9 flex-1 border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]",
                )}
              >
                {c.label}
                <Stack amount={amt(`column:${[...c.pockets].sort((a, b) => a - b).join("-")}`)} />
              </button>
            ))}
            <div className="w-11 shrink-0" />
          </div>
        </div>
      </div>

      {/* Four-number groups */}
      <div className="flex gap-1.5">
        {FOUR_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("four_group", g.label, g.pockets)}
            className={cn(
              cellBase,
              "h-9 flex-1 border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]",
            )}
          >
            {g.label} · 3×
            <Stack amount={amt(`four_group:${g.pockets.join("-")}`)} />
          </button>
        ))}
      </div>

      {/* Outside bets */}
      <div className="grid grid-cols-3 gap-1.5">
        {outside.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onPlace(o.key, o.label, o.pockets)}
            className={cn(
              cellBase,
              "h-10 bg-[var(--color-surface-2)] text-[11px] uppercase tracking-[0.14em]",
              o.tone,
            )}
          >
            {o.label} · 2×
            <Stack amount={amt(`${o.key}:${[...o.pockets].sort((a, b) => a - b).join("-")}`)} />
          </button>
        ))}
      </div>

      <p className="text-center text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        Total return = 12 ÷ pockets covered · straight pays {returnMultiplier(1)}×
      </p>
    </div>
  );
}
