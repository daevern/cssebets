import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, ArrowUpRight, Radio } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { CsseLogo } from "@/components/brand/CsseMark";

function PitchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      <rect x="2.5" y="4.5" width="19" height="15" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
      <circle cx="12" cy="12" r="2.4" />
      <rect x="2.5" y="8.5" width="3" height="7" />
      <rect x="18.5" y="8.5" width="3" height="7" />
    </svg>
  );
}

export const Route = createFileRoute("/_authenticated/bets")({
  head: () => ({
    meta: [
      { title: "Bets — cssebets" },
      { name: "description", content: "Place predictions on matches or the tournament winner." },
    ],
  }),
  component: BetsHub,
});

/* corner tick marks, mirrored from dashboard */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
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

type Tile = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  kicker: string;
  label: string;
  desc: string;
  cta: string;
  tour?: string;
  accent?: boolean;
};

function BetsHub() {
  const tiles: Tile[] = [
    {
      to: "/matches",
      icon: PitchIcon,
      kicker: "Market №01",
      label: "Matches",
      desc: "Back a side. Fade the crowd. Match-by-match calls with live odds.",
      cta: "Open the slate",
      tour: "bet-button",
      accent: true,
    },
    {
      to: "/tournament-winner",
      icon: Crown,
      kicker: "Market №02",
      label: "Tournament Winner",
      desc: "One pick. One champion. Lock your outright before the field tightens.",
      cta: "Crown your pick",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard grain background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />

      <div className="relative mx-auto flex max-w-md flex-col gap-5 px-4 py-5 md:max-w-2xl md:py-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CsseLogo size={22} />
          </Link>
        </header>

        {/* Editorial intro */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            Markets · Open
          </div>
          <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">
            Pick your <span className="text-[var(--color-neon)]">market</span>.
            <br />
            <span className="text-[var(--color-ink-muted)]">Then take a side.</span>
          </h1>
        </section>

        {/* Tiles */}
        <div data-tour="available-matches" className="grid gap-4 md:grid-cols-2">
          {tiles.map((t, i) => (
            <Link
              key={t.to}
              to={t.to}
              data-tour={t.tour}
              className="group"
            >
              <article
                className={`relative overflow-hidden border bg-[var(--color-surface-2)] transition-colors ${
                  t.accent
                    ? "border-[var(--color-neon)]/25 hover:border-[var(--color-neon)]/60"
                    : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/40"
                }`}
              >
                <Corner pos="tl" />
                <Corner pos="tr" />
                <Corner pos="bl" />
                <Corner pos="br" />

                {/* stencil header band */}
                <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                    <t.icon className="h-3 w-3" />
                    {t.kicker}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                    {String(i + 1).padStart(2, "0")} / {String(tiles.length).padStart(2, "0")}
                  </span>
                </div>

                <div className="px-5 pb-5 pt-5">
                  <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
                    {t.label}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {t.desc}
                  </p>

                  <div
                    className={`mt-5 flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-all ${
                      t.accent
                        ? "bg-[var(--color-neon)] text-black shadow-[0_0_24px_var(--color-neon-glow)] group-hover:brightness-110"
                        : "border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/5 text-[var(--color-neon)] group-hover:bg-[var(--color-neon)]/10"
                    }`}
                  >
                    <span>{t.cta}</span>
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
