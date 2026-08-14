import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { kenoHitChance, kenoPaytable, type KenoRisk } from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.keno;
const LOSS = "#ff4d5e";

function StatCell({ label, value, tone }: { label: string; value: string; tone?: "accent" | "loss" }) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-[6px] border px-2.5 py-2"
      style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
    >
      <span className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span
        className="font-display text-[15px] font-black tabular-nums leading-none"
        style={{ color: tone === "accent" ? T.accent : tone === "loss" ? LOSS : "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Keno playfield — Stake-style slate console: 40-number grid, sequenced ball
 * reveal and a live paytable rail. Presentation only; the server decides the
 * draw and the payout.
 */
export function KenoBoard({
  picks,
  drawn,
  revealed,
  risk,
  onToggle,
  disabled,
  multiplier,
}: {
  picks: number[];
  /** Full draw from the server (empty until a ticket settles). */
  drawn: number[];
  /** How many of the drawn balls are currently shown. */
  revealed: number;
  risk: KenoRisk;
  onToggle: (n: number) => void;
  disabled?: boolean;
  multiplier: number | null;
}) {
  const shown = drawn.slice(0, revealed);
  const table = kenoPaytable(risk, Math.max(picks.length, 1));
  const hits = shown.filter((n) => picks.includes(n)).length;
  const drawing = drawn.length > 0 && revealed < drawn.length;

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-3 pb-3 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => {
          const picked = picks.includes(n);
          const isDrawn = shown.includes(n);
          const hit = picked && isDrawn;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(n)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-[6px] border font-display text-[13px] font-black tabular-nums transition-transform",
                !disabled && "active:scale-95",
                hit && "motion-safe:[animation:kenoHitPop_320ms_ease-out]",
              )}
              style={{
                background: hit ? T.accent : isDrawn ? "#2f4553" : picked ? "#0f212e" : "#1b2f3c",
                borderColor: hit
                  ? T.accent
                  : picked
                    ? T.accent
                    : isDrawn
                      ? "rgba(255,255,255,.22)"
                      : "rgba(255,255,255,.06)",
                color: hit ? "#03210a" : picked ? T.accent : isDrawn ? "#ffffff" : "rgba(255,255,255,.5)",
                boxShadow: hit ? `0 0 0 1px ${T.accent}` : "none",
              }}
              aria-pressed={picked}
              aria-label={`Number ${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* paytable rail */}
      <div className="mt-3 flex gap-1 overflow-hidden rounded-[6px] border p-1"
        style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
      >
        {table.map((m, h) => (
          <div
            key={h}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[4px] px-0.5 py-1"
            style={{
              background: h === hits && shown.length > 0 ? "rgba(0,231,1,.14)" : "transparent",
            }}
          >
            <span
              className="w-full truncate text-center font-display text-[10px] font-black tabular-nums"
              style={{ color: m > 0 ? T.accent : "rgba(255,255,255,.35)" }}
            >
              {m > 0 ? `${m}×` : "—"}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-white/35">
              {h} hit
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-stretch gap-2">
        <StatCell label="Marked" value={`${picks.length}/10`} />
        <StatCell label="Hits" value={shown.length ? String(hits) : "—"} tone={hits > 0 ? "accent" : undefined} />
        <StatCell
          label={drawing ? "Drawing" : "Pays"}
          value={multiplier == null ? "—" : `${multiplier}×`}
          tone={multiplier ? "accent" : multiplier === 0 ? "loss" : undefined}
        />
        <StatCell
          label="Top hit"
          value={
            picks.length
              ? `${(kenoHitChance(picks.length, picks.length) * 100).toFixed(2)}%`
              : "—"
          }
        />
      </div>
    </div>
  );
}
