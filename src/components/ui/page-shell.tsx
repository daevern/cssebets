import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Radio } from "lucide-react";
import { CsseLogo } from "@/components/brand/CsseMark";

/* cssebets unified design shell — used across dashboard / bets / matches /
   wallet / payout / settings / help. Scoreboard-grain background, stencil
   editorial header, neon accents. */
export function PageShell({
  kicker,
  title,
  titleAccent,
  children,
  wide = false,
}: {
  kicker: string;
  title: ReactNode;
  titleAccent?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen -mx-4 -my-6 bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      <div
        className={`relative mx-auto flex ${wide ? "max-w-3xl" : "max-w-md md:max-w-2xl"} flex-col gap-5 px-4 py-5 md:py-8`}
      >
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CsseLogo size={22} />
          </Link>
        </header>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            {kicker}
          </div>
          <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">
            {title}
            {titleAccent && (
              <>
                {" "}
                <span className="text-[var(--color-neon)]">{titleAccent}</span>
              </>
            )}
          </h1>
        </section>

        {children}
      </div>
    </div>
  );
}

export function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

/* Stencil panel — replaces shadcn Card on cssebets pages. */
export function StencilPanel({
  kicker,
  meta,
  accent = false,
  children,
  className = "",
  tour,
}: {
  kicker?: ReactNode;
  meta?: ReactNode;
  accent?: boolean;
  children: ReactNode;
  className?: string;
  tour?: string;
}) {
  return (
    <article
      data-tour={tour}
      className={`relative overflow-hidden border bg-[var(--color-surface-2)] ${
        accent
          ? "border-[var(--color-neon)]/25"
          : "border-[var(--color-surface-border)]"
      } ${className}`}
    >
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      {(kicker || meta) && (
        <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
          {kicker && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              {kicker}
            </span>
          )}
          {meta && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {meta}
            </span>
          )}
        </div>
      )}
      <div className="px-5 py-5">{children}</div>
    </article>
  );
}
