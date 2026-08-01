import { useState } from "react";
import { Split, Info } from "lucide-react";
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

/* Felt table palette — a physical casino artifact, kept local to this board. */
const FELT_BG = "linear-gradient(160deg, #071310 0%, #04100d 45%, #020a08 100%)";
const FELT_BORDER = "rgba(90, 200, 150, 0.16)";
const CELL_BG = "rgba(255,255,255,0.035)";
const RED_INK = "#ef5061";
/* Slight tints so red/black pockets read as red/black felt cells. */
const RED_CELL_BG = "linear-gradient(180deg, rgba(190,40,55,0.42), rgba(140,25,38,0.30))";
const RED_CELL_BORDER = "rgba(239,80,97,0.35)";
const BLACK_CELL_BG = "linear-gradient(180deg, rgba(10,12,14,0.85), rgba(4,6,7,0.7))";
const BLACK_CELL_BORDER = "rgba(255,255,255,0.14)";

const cellBase =
  "relative grid place-items-center rounded-[5px] border font-display font-bold tabular-nums transition-all active:scale-[0.97] disabled:opacity-40";

function Stack({ amount }: { amount?: number }) {
  if (!amount) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-neon)] px-1 text-[9px] font-bold text-black shadow-[0_0_10px_rgba(var(--neon-glow-rgb),0.6)]">
      {amount}
    </span>
  );
}

function Diamond({ tone }: { tone: "red" | "black" }) {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 rotate-45 rounded-[3px] border"
      style={{
        borderColor: tone === "red" ? RED_INK : "rgba(255,255,255,0.75)",
        background:
          tone === "red" ? "rgba(239,80,97,0.22)" : "rgba(255,255,255,0.06)",
      }}
    />
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

  const outside: {
    key: BetTypeKey;
    label: string;
    pockets: number[];
    icon?: "red" | "black";
    ink?: string;
  }[] = [
    { key: "low", label: "1–6", pockets: LOW },
    { key: "even", label: "Even", pockets: EVEN },
    { key: "red", label: "Red", pockets: RED_POCKETS, icon: "red", ink: RED_INK },
    { key: "black", label: "Black", pockets: BLACK_POCKETS, icon: "black" },
    { key: "odd", label: "Odd", pockets: ODD },
    { key: "high", label: "7–12", pockets: HIGH },
  ];

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ background: FELT_BG, borderColor: FELT_BORDER }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink)]">
          Roulette table
        </span>
        <button
          type="button"
          onClick={() => {
            setSplitMode((v) => !v);
            setSplitFirst(null);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] transition-colors",
            splitMode
              ? "border-[var(--color-neon)] bg-[var(--color-neon)]/12 text-[var(--color-neon)]"
              : "text-[var(--color-ink-muted)]",
          )}
          style={splitMode ? undefined : { borderColor: FELT_BORDER }}
        >
          {splitMode
            ? splitFirst == null
              ? "Split · pick 1st"
              : `Split · ${splitFirst} + ?`
            : "Split bet"}
          <Split className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main grid: 0 | numbers | streets */}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleNumber(0)}
          className={cn(
            cellBase,
            "w-12 shrink-0 rounded-[5px] border-[var(--color-neon)]/60 text-lg text-[var(--color-neon)]",
          )}
          style={{ background: "rgba(60, 220, 150, 0.06)" }}
        >
          0
          <Stack amount={amt("straight:0")} />
        </button>

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
                    className={cn(cellBase, "h-12 flex-1 text-xl")}
                    style={{
                      background: CELL_BG,
                      borderColor: FELT_BORDER,
                      color: colour === "red" ? RED_INK : "var(--color-ink)",
                    }}
                  >
                    <span className={cn(selected && "underline underline-offset-4")}>{n}</span>
                    {selected && (
                      <span className="pointer-events-none absolute inset-0 rounded-[5px] ring-2 ring-[var(--color-neon)]" />
                    )}
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
                  "h-12 w-14 shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]",
                )}
                style={{ background: CELL_BG, borderColor: FELT_BORDER }}
              >
                4 to 1
                <Stack amount={amt(`street:${STREETS[ri].join("-")}`)} />
              </button>
            </div>
          ))}

          {/* Columns row */}
          <div className="flex gap-1.5">
            {COLUMNS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={disabled}
                onClick={() => onPlace("column", c.label, c.pockets)}
                className={cn(
                  cellBase,
                  "h-10 flex-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]",
                )}
                style={{ background: CELL_BG, borderColor: FELT_BORDER }}
              >
                {c.label}
                <Stack amount={amt(`column:${[...c.pockets].sort((a, b) => a - b).join("-")}`)} />
              </button>
            ))}
            <div className="w-14 shrink-0" />
          </div>
        </div>
      </div>

      {/* Four-number groups */}
      <div className="mt-1.5 flex gap-1.5">
        {FOUR_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("four_group", g.label, g.pockets)}
            className={cn(
              cellBase,
              "h-10 flex-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]",
            )}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
          >
            {g.label} · 3×
            <Stack amount={amt(`four_group:${g.pockets.join("-")}`)} />
          </button>
        ))}
      </div>

      {/* Outside bets */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {outside.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onPlace(o.key, o.label, o.pockets)}
            className={cn(
              cellBase,
              "h-12 gap-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]",
            )}
            style={{
              background: CELL_BG,
              borderColor: FELT_BORDER,
              color: o.ink ?? undefined,
            }}
          >
            {o.icon ? <Diamond tone={o.icon} /> : <span>{o.label}</span>}
            <span className="text-[9px] tracking-[0.14em] opacity-70">2×</span>
            <Stack amount={amt(`${o.key}:${[...o.pockets].sort((a, b) => a - b).join("-")}`)} />
          </button>
        ))}
      </div>

      {/* Footer */}
      <div
        className="mt-3 flex items-center justify-between gap-2 border-t pt-3"
        style={{ borderColor: FELT_BORDER }}
      >
        <div
          className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
          style={{ borderColor: FELT_BORDER }}
        >
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Total return
          </span>
          <span className="font-display text-sm font-bold" style={{ color: RED_INK }}>
            {returnMultiplier(1)}×
          </span>
        </div>
        <p className="text-right text-[9px] uppercase leading-relaxed tracking-[0.16em] text-[var(--color-ink-muted)]">
          Covers 12 numbers
          <br />
          Total return = 12 ÷ pockets covered
        </p>
        <Info className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
      </div>
    </div>
  );
}
