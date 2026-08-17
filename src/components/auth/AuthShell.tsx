import { Link } from "@tanstack/react-router";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";

/**
 * Kalshi-style auth shell: quiet split layout.
 * Left = brand + live market strip (desktop). Right = a single clean form column.
 */

type MarketRow = { question: string; yes: number; tag: string };

const MARKETS: MarketRow[] = [
  { question: "Will Real Madrid win their next match?", yes: 61, tag: "Football" },
  { question: "Verstappen podium in Bahrain?", yes: 48, tag: "Formula 1" },
  { question: "Main event ends inside the distance?", yes: 37, tag: "UFC" },
  { question: "Plinko 10x hit in the next 100 drops?", yes: 72, tag: "Arcade" },
];

function MarketCard({ m }: { m: MarketRow }) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          {m.tag}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
          {m.yes}% chance
        </span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug text-[var(--color-ink)]">
        {m.question}
      </p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--color-neon)]"
          style={{ width: `${m.yes}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[color-mix(in_oklab,var(--color-neon)_14%,transparent)] py-2 text-center text-xs font-semibold text-[var(--color-neon)]">
          Yes {m.yes}¢
        </div>
        <div className="rounded-lg bg-[color-mix(in_oklab,var(--neon-red)_14%,transparent)] py-2 text-center text-xs font-semibold text-[var(--neon-red)]">
          No {100 - m.yes}¢
        </div>
      </div>
    </div>
  );
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  topSlot,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  topSlot?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--color-surface)] text-[var(--color-ink)] lg:grid lg:grid-cols-[1fr_minmax(420px,46%)]">
      {/* Left rail — brand + market preview (desktop) */}
      <aside className="relative hidden h-[100dvh] flex-col justify-between overflow-hidden border-r border-[var(--color-surface-border)] p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 0%, rgba(34,224,107,0.10), transparent 70%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-3">
          <CsseAppIcon size={32} />
          <CsseWordmark size={17} />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Trade the outcome.
            <br />
            <span className="text-[var(--color-ink-muted)]">Play the odds.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Prediction markets across football, Formula 1 and UFC — plus a provably
            fair arcade. One balance, live prices, instant settlement.
          </p>
          <div className="mt-6 grid gap-3">
            {MARKETS.slice(0, 3).map((m) => (
              <MarketCard key={m.question} m={m} />
            ))}
          </div>
        </div>

        <p className="relative text-xs text-[var(--color-ink-muted)]">
          Competitive Strategy Starts Everywhere
        </p>
      </aside>

      {/* Right column — form */}
      <main className="flex h-[100dvh] flex-col overflow-hidden px-5 py-4 sm:px-10 lg:px-14 lg:py-5">
        <Link
          to="/"
          className="mb-3 flex items-center gap-3 lg:hidden"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <CsseAppIcon size={30} />
          <CsseWordmark size={16} />
        </Link>

        {topSlot && <div className="mx-auto w-full max-w-[400px] shrink-0">{topSlot}</div>}

        <div className="mx-auto flex w-full max-w-[400px] min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div className="shrink-0">
            {eyebrow && (
              <span className="mb-1.5 text-xs font-medium text-[var(--color-neon)]">
                {eyebrow}
              </span>
            )}
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-hidden">{children}</div>
          {footer && <div className="mt-5 shrink-0">{footer}</div>}
        </div>

        <p className="mx-auto mt-4 w-full max-w-[400px] shrink-0 text-xs text-[var(--color-ink-muted)]">
          By continuing you agree to our terms. Markets involve risk — play responsibly.
        </p>
      </main>

    </div>
  );
}

/* Shared field primitives — quiet, rounded, Kalshi-flavoured. */

export const authInputClass =
  "h-11 w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--ink-dim)] outline-none transition-colors focus:border-[var(--color-neon)] focus:ring-0";

export function AuthField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-[var(--color-ink)]"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  );
}

export function AuthSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md py-2 text-[13px] font-medium transition-colors ${
            value === o.value
              ? "bg-[var(--surface-3)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AuthSubmit({
  loading,
  children,
}: {
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-11 w-full rounded-lg bg-[var(--color-neon)] text-[15px] font-semibold text-[#04140A] transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
