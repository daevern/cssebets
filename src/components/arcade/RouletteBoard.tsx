import { Fragment, useState } from "react";
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
import { paletteFor } from "@/components/arcade/CasinoChip";

export type PlaceBet = (betType: BetTypeKey, label: string, pockets: number[]) => void;

/* Classic casino felt — green cloth, white hairlines, solid red/black pockets. */
const FELT_BG = "#213743";
const FELT_BORDER = "rgba(255,255,255,0.14)";
const CELL_BG = "rgba(255,255,255,0.06)";
const RED_INK = "#ffffff";
const RED_CELL_BG = "#d0455a";
const RED_CELL_BORDER = "rgba(255,255,255,0.18)";
const BLACK_CELL_BG = "#16242e";
const BLACK_CELL_BORDER = "rgba(255,255,255,0.18)";

const cellBase =
  "relative grid place-items-center rounded-[4px] border font-display font-bold tabular-nums transition-colors disabled:opacity-40";

function Stack({ amount }: { amount?: number }) {
  if (!amount) return null;
  const p = paletteFor(amount);
  return (
    <span className="pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-0.5 text-[8px] font-bold tabular-nums"
      style={{
        background: p.face,
        color: p.ink,
        boxShadow: `0 0 0 1.5px ${p.edge}`,
      }}
    >
      {amount}
    </span>
  );
}


function Diamond({ tone }: { tone: "red" | "black" }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]"
      style={{ background: "#ffffff" }}
    />
  );
}

export function RouletteBoard({
  stakes,
  onPlace,
  disabled,
  bare,
}: {
  /** positionKey -> total staked */
  stakes: Record<string, number>;
  onPlace: PlaceBet;
  disabled?: boolean;
  /** render without its own felt panel (used when nested in the curved table shell) */
  bare?: boolean;
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

  const NumberCell = ({ n, className }: { n: number; className?: string }) => {
    const colour = pocketColour(n);
    const selected = splitFirst === n;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleNumber(n)}
        className={cn(cellBase, "text-[12px]", className)}
        style={{
          background: colour === "red" ? RED_CELL_BG : BLACK_CELL_BG,
          borderColor: colour === "red" ? RED_CELL_BORDER : BLACK_CELL_BORDER,
          color: "#ffffff",
        }}
      >
        <span>{n}</span>
        {selected && (
          <span className="pointer-events-none absolute inset-0 rounded-[4px] ring-2 ring-[var(--color-neon)]" />
        )}
        <Stack amount={amt(`straight:${n}`)} />
      </button>
    );
  };

  const ZeroCell = ({ className }: { className?: string }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => handleNumber(0)}
      className={cn(cellBase, "text-[13px] text-white", className)}
      style={{ background: FELT_BG, borderColor: "rgba(255,255,255,0.75)" }}
    >
      0
      <Stack amount={amt("straight:0")} />
    </button>
  );

  const OutsideRow = () => (
    <div className="grid grid-cols-3 gap-[3px] sm:grid-cols-6">
      {outside.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onPlace(o.key, o.label, o.pockets)}
          className={cn(cellBase, "h-8 gap-1 text-[10px] uppercase tracking-[0.14em] text-white")}
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
    </div>
  );

  const SixLines = () => (
    <div className="grid grid-cols-3 gap-[3px] sm:grid-cols-6">
      {SIX_LINES.map((g) => (
        <button
          key={g.label}
          type="button"
          disabled={disabled}
          onClick={() => onPlace("six_line", `Line ${g.label}`, g.pockets)}
          className={cn(cellBase, "h-6 text-[9px] tracking-tight text-white")}
          style={{ background: CELL_BG, borderColor: FELT_BORDER }}
        >
          {g.label}
          <Stack amount={amt(key("six_line", g.pockets))} />
        </button>
      ))}
    </div>
  );

  /* Horizontal (desktop) — 3 rows × 12 columns, zero on the left. */
  const numberRows = [2, 1, 0].map((offset) =>
    Array.from({ length: 12 }, (_, c) => c * 3 + offset + 1),
  );

  return (
    <div
      className={bare ? "p-0" : "rounded-[10px] border p-2"}
      style={bare ? undefined : { background: FELT_BG, borderColor: FELT_BORDER }}
    >

      <div className="mb-2 flex items-center justify-between gap-2">
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
            "inline-flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em] transition-colors",
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

      {/* ── Mobile: vertical table (3 columns × 12 rows) ── */}
      <div className="space-y-[3px] lg:hidden">
        <div className="grid grid-cols-[22px_repeat(3,minmax(0,1fr))_30px] gap-[3px]">
          <div />
          <ZeroCell className="col-span-3 h-8" />
          <div />

          {Array.from({ length: 12 }, (_, r) => {
            const street = STREETS[r];
            const dozenIdx = Math.floor(r / 4);
            return (
              <Fragment key={`vrow-${r}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPlace("street", `Street ${street[0]}–${street[2]}`, street)}
                  className={cn(cellBase, "h-7 text-[8px] text-white")}
                  style={{ background: CELL_BG, borderColor: FELT_BORDER }}
                  aria-label={`Street ${street[0]} to ${street[2]}`}
                >
                  {street[0]}
                  <Stack amount={amt(key("street", street))} />
                </button>

                {street.map((n) => (
                  <NumberCell key={n} n={n} className="h-7" />
                ))}

                {r % 4 === 0 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onPlace("dozen", DOZENS[dozenIdx].label, DOZENS[dozenIdx].pockets)
                    }
                    className={cn(
                      cellBase,
                      "row-span-4 text-[9px] uppercase tracking-[0.2em] text-white",
                    )}
                    style={{
                      background: CELL_BG,
                      borderColor: FELT_BORDER,
                      writingMode: "vertical-rl",
                    }}
                  >
                    {DOZENS[dozenIdx].label}
                    <Stack amount={amt(key("dozen", DOZENS[dozenIdx].pockets))} />
                  </button>
                )}
              </Fragment>
            );
          })}

          <div />
          {COLUMNS.map((col) => (
            <button
              key={`vcol-${col.label}`}
              type="button"
              disabled={disabled}
              onClick={() => onPlace("column", col.label, col.pockets)}
              className={cn(cellBase, "h-7 text-[9px] text-white")}
              style={{ background: CELL_BG, borderColor: FELT_BORDER }}
              aria-label={`${col.label} — 2 to 1`}
            >
              2:1
              <Stack amount={amt(key("column", col.pockets))} />
            </button>
          ))}
          <div />
        </div>

        <OutsideRow />
        <SixLines />
      </div>

      {/* ── Desktop: classic horizontal table ── */}
      <div className="hidden space-y-[3px] lg:block">
        <div className="grid grid-cols-[20px_repeat(12,minmax(0,1fr))_26px] gap-[3px]">
          <div />
          {STREETS.map((s) => (
            <button
              key={`street-${s[0]}`}
              type="button"
              disabled={disabled}
              onClick={() => onPlace("street", `Street ${s[0]}–${s[2]}`, s)}
              className={cn(cellBase, "h-5 text-[7px] tracking-tight text-white")}
              style={{ background: CELL_BG, borderColor: FELT_BORDER }}
              aria-label={`Street ${s[0]} to ${s[2]}`}
            >
              {s[0]}
              <Stack amount={amt(key("street", s))} />
            </button>
          ))}
          <div />

          <ZeroCell className="row-span-3" />

          {numberRows.map((row, ri) => {
            const col = COLUMNS[2 - ri];
            return (
              <Fragment key={`row-${ri}`}>
                {row.map((n) => (
                  <NumberCell key={n} n={n} className="h-8" />
                ))}
                <button
                  key={`col-${col.label}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPlace("column", col.label, col.pockets)}
                  className={cn(cellBase, "h-8 text-[8px] text-white")}
                  style={{ background: CELL_BG, borderColor: FELT_BORDER }}
                  aria-label={`${col.label} — 2 to 1`}
                >
                  2:1
                  <Stack amount={amt(key("column", col.pockets))} />
                </button>
              </Fragment>
            );
          })}

          <div />
          {DOZENS.map((g) => (
            <button
              key={g.label}
              type="button"
              disabled={disabled}
              onClick={() => onPlace("dozen", g.label, g.pockets)}
              className={cn(
                cellBase,
                "col-span-4 h-8 text-[9px] uppercase tracking-[0.18em] text-white",
              )}
              style={{ background: CELL_BG, borderColor: FELT_BORDER }}
            >
              {g.label}
              <Stack amount={amt(key("dozen", g.pockets))} />
            </button>
          ))}
          <div />
        </div>

        <OutsideRow />
        <SixLines />
      </div>
    </div>
  );
}
