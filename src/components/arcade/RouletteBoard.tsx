import { useState } from "react";
import { Split } from "lucide-react";
import {
  COLUMNS,
  DOZENS,
  SIX_LINES,
  STREETS,
  LOW,
  HIGH,
  ODD,
  EVEN,
  RED_POCKETS,
  BLACK_POCKETS,
  areAdjacent,
  pocketColour,
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
    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-neon)] px-[3px] text-[8px] font-bold leading-none text-black">
      {amount}
    </span>
  );
}

function Diamond({ tone }: { tone: "red" | "black" }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 rotate-45 rounded-[2px]"
      style={{ background: tone === "red" ? RED_INK : "rgba(255,255,255,0.75)" }}
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
  const key = (type: string, pockets: number[]) =>
    `${type}:${[...pockets].sort((a, b) => a - b).join("-")}`;

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
    { key: "low", label: "1–18", pockets: LOW },
    { key: "even", label: "Even", pockets: EVEN },
    { key: "red", label: "Red", pockets: RED_POCKETS, icon: "red", ink: RED_INK },
    { key: "black", label: "Black", pockets: BLACK_POCKETS, icon: "black" },
    { key: "odd", label: "Odd", pockets: ODD },
    { key: "high", label: "19–36", pockets: HIGH },
  ];

  /* Classic horizontal felt: 3 rows × 12 columns, zero on the left. */
  const numberRows = [2, 1, 0].map((offset) =>
    Array.from({ length: 12 }, (_, c) => c * 3 + offset + 1),
  );

  return (
    <div
      className="rounded-[6px] border p-1.5"
      style={{ background: FELT_BG, borderColor: FELT_BORDER }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[8px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          Table
        </span>
        <button
          type="button"
          onClick={() => {
            setSplitMode((v) => !v);
            setSplitFirst(null);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-[3px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em] transition-colors",
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
            : "Split"}
          <Split className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-[18px_repeat(12,minmax(0,1fr))_22px] gap-[2px]">
        {/* Streets — one per vertical trio */}
        <div />
        {STREETS.map((s) => (
          <button
            key={`street-${s[0]}`}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("street", `Street ${s[0]}–${s[2]}`, s)}
            className={cn(cellBase, "h-4 text-[7px] tracking-tight text-[var(--color-ink-muted)]")}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
            aria-label={`Street ${s[0]} to ${s[2]}`}
          >
            {s[0]}
            <Stack amount={amt(key("street", s))} />
          </button>
        ))}
        <div />

        {/* Zero spans the three number rows */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleNumber(0)}
          className={cn(
            cellBase,
            "row-span-3 border-[var(--color-neon)]/60 text-sm text-[var(--color-neon)]",
          )}
          style={{ background: "rgba(60, 220, 150, 0.10)" }}
        >
          0
          <Stack amount={amt("straight:0")} />
        </button>

        {numberRows.map((row, ri) => {
          const col = COLUMNS[2 - ri];
          return (
            <>
              {row.map((n) => {
                const colour = pocketColour(n);
                const selected = splitFirst === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleNumber(n)}
                    className={cn(cellBase, "h-7 text-[11px]")}
                    style={{
                      background: colour === "red" ? RED_CELL_BG : BLACK_CELL_BG,
                      borderColor: colour === "red" ? RED_CELL_BORDER : BLACK_CELL_BORDER,
                      color: colour === "red" ? RED_INK : "var(--color-ink)",
                    }}
                  >
                    <span className={cn(selected && "underline underline-offset-2")}>{n}</span>
                    {selected && (
                      <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-2 ring-[var(--color-neon)]" />
                    )}
                    <Stack amount={amt(`straight:${n}`)} />
                  </button>
                );
              })}
              <button
                key={`col-${col.label}`}
                type="button"
                disabled={disabled}
                onClick={() => onPlace("column", col.label, col.pockets)}
                className={cn(cellBase, "h-7 text-[7px] leading-tight text-[var(--color-ink-muted)]")}
                style={{ background: CELL_BG, borderColor: FELT_BORDER }}
                aria-label={`${col.label} — 2 to 1`}
              >
                2:1
                <Stack amount={amt(key("column", col.pockets))} />
              </button>
            </>
          );
        })}

        {/* Dozens */}
        <div />
        {DOZENS.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("dozen", g.label, g.pockets)}
            className={cn(
              cellBase,
              "col-span-4 h-7 text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink)]",
            )}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
          >
            {g.label}
            <Stack amount={amt(key("dozen", g.pockets))} />
          </button>
        ))}
        <div />

        {/* Outside even-money bets */}
        <div />
        {outside.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onPlace(o.key, o.label, o.pockets)}
            className={cn(
              cellBase,
              "col-span-2 h-7 gap-1 text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]",
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
            <Stack amount={amt(key(o.key, o.pockets))} />
          </button>
        ))}
        <div />
      </div>

      {/* Six lines */}
      <div className="mt-[2px] grid grid-cols-6 gap-[2px]">
        {SIX_LINES.map((g) => (
          <button
            key={g.label}
            type="button"
            disabled={disabled}
            onClick={() => onPlace("six_line", `Line ${g.label}`, g.pockets)}
            className={cn(cellBase, "h-6 text-[8px] tracking-tight text-[var(--color-ink-muted)]")}
            style={{ background: CELL_BG, borderColor: FELT_BORDER }}
          >
            {g.label}
            <Stack amount={amt(key("six_line", g.pockets))} />
          </button>
        ))}
      </div>
    </div>
  );
}
