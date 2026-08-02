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
const FELT_BG = "#0a1512";
const FELT_BORDER = "rgba(255,255,255,0.07)";
const CELL_BG = "rgba(255,255,255,0.05)";
const RED_INK = "#ef5061";
/* Flat 2D palette — solid fills, no gradients or shadows. */
const RED_CELL_BG = "rgba(239,80,97,0.14)";
const RED_CELL_BORDER = "rgba(239,80,97,0.35)";
const BLACK_CELL_BG = "rgba(255,255,255,0.05)";
const BLACK_CELL_BORDER = "rgba(255,255,255,0.10)";

const cellBase =
  "relative grid place-items-center rounded-[3px] border font-display font-bold tabular-nums transition-colors disabled:opacity-40";

function Stack({ amount }: { amount?: number }) {
  if (!amount) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-neon)] px-1 text-[9px] font-bold text-black">
      {amount}
    </span>
  );
}

function Diamond({ tone }: { tone: "red" | "black" }) {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 rotate-45 rounded-[2px]"
      style={{ background: tone === "red" ? RED_INK : "rgba(255,255,255,0.75)" }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <span className="h-px flex-1" style={{ background: FELT_BORDER }} />
      <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
        {children}
      </span>
      <span className="h-px flex-1" style={{ background: FELT_BORDER }} />
    </div>
  );
}

function SpecialIcon({ tone }: { tone?: "red" | "black" }) {
  const colour =
    tone === "red" ? RED_INK : tone === "black" ? "rgba(255,255,255,0.65)" : "rgba(90,200,150,0.7)";
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 rotate-45 rounded-[3px] border"
      style={{ borderColor: colour, background: "transparent" }}
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
      className="rounded-[6px] border p-2"
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
            "inline-flex items-center gap-1 rounded-[3px] border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] transition-colors",
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
      <div className="flex gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleNumber(0)}
          className={cn(
            cellBase,
            "w-12 shrink-0 rounded-[3px] border-[var(--color-neon)]/60 text-lg text-[var(--color-neon)]",
          )}
          style={{ background: "rgba(60, 220, 150, 0.10)" }}
        >
          0
          <Stack amount={amt("straight:0")} />
        </button>

        <div className="flex-1 space-y-1.5">
          {BOARD_GRID.map((row, ri) => (
            <div key={ri} className="flex gap-1">
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
                      background: colour === "red" ? RED_CELL_BG : BLACK_CELL_BG,
                      borderColor: colour === "red" ? RED_CELL_BORDER : BLACK_CELL_BORDER,
                      color: colour === "red" ? RED_INK : "var(--color-ink)",
                    }}
                  >
                    <span className={cn(selected && "underline underline-offset-4")}>{n}</span>
                    {selected && (
                      <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-2 ring-[var(--color-neon)]" />
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
          <div className="flex gap-1">
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

      {/* Outside bets strip */}
      <div className="mt-1.5 grid grid-cols-3 gap-1 sm:grid-cols-6">
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
              background:
                o.icon === "red" ? RED_CELL_BG : o.icon === "black" ? BLACK_CELL_BG : CELL_BG,
              borderColor:
                o.icon === "red"
                  ? RED_CELL_BORDER
                  : o.icon === "black"
                    ? BLACK_CELL_BORDER
                    : FELT_BORDER,
              color: o.ink ?? undefined,
            }}
          >
            {o.icon ? <Diamond tone={o.icon} /> : <span>{o.label}</span>}
            <Stack amount={amt(`${o.key}:${[...o.pockets].sort((a, b) => a - b).join("-")}`)} />
          </button>
        ))}
      </div>

      {/* Neighbor bets */}
      <SectionLabel>Neighbor bets</SectionLabel>
      <div className="grid grid-cols-4 gap-1">
        {FOUR_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("four_group", g.label, g.pockets)}
            className={cn(
              cellBase,
              "h-12 flex-col rounded-[3px] text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink)]",
            )}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
          >
            <span>{g.label}</span>
            <span className="text-[8px] tracking-[0.14em] text-[var(--color-ink-muted)]">
              {g.pockets.length} numbers
            </span>
            <Stack amount={amt(`four_group:${g.pockets.join("-")}`)} />
          </button>
        ))}
      </div>

      {/* Special bets */}
      <SectionLabel>Special bets</SectionLabel>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {outside.map((o) => (
          <button
            key={`special-${o.key}`}
            type="button"
            disabled={disabled}
            onClick={() => onPlace(o.key, o.label, o.pockets)}
            className={cn(
              cellBase,
              "h-14 grid-flow-col items-center justify-start gap-2.5 rounded-[3px] px-3",
            )}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
          >
            <SpecialIcon tone={o.icon} />
            <span className="grid justify-items-start">
              <span
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{ color: o.ink ?? "var(--color-ink)" }}
              >
                {o.label}
              </span>
              <span className="text-[9px] tracking-[0.18em] text-[var(--color-ink-muted)]">
                {returnMultiplier(o.pockets.length).toFixed(2)}×
              </span>
            </span>
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
          className="flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5"
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
