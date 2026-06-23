import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, ArrowUpRight, Radio } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { CsseLogo } from "@/components/brand/CsseMark";

function TacticalPitch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="w-full max-w-[200px] h-auto mx-auto text-[var(--color-neon)] opacity-90 drop-shadow-[0_0_8px_rgba(var(--color-neon-glow-rgb),0.3)]"
      {...props}
    >
      {/* Field boundary */}
      <rect x="10" y="10" width="180" height="100" rx="2" strokeWidth="2" />
      {/* Midfield line */}
      <line x1="100" y1="10" x2="100" y2="110" />
      {/* Center circle */}
      <circle cx="100" cy="60" r="20" />
      <circle cx="100" cy="60" r="1.5" fill="currentColor" />
      {/* Penalty Areas */}
      <rect x="10" y="30" width="25" height="60" />
      <rect x="165" y="30" width="25" height="60" />
      {/* Goal Areas */}
      <rect x="10" y="45" width="8" height="30" />
      <rect x="182" y="45" width="8" height="30" />
      {/* Penalty spots & arcs */}
      <circle cx="28" cy="60" r="1" fill="currentColor" />
      <circle cx="172" cy="60" r="1" fill="currentColor" />
      <path d="M 35 48 A 15 15 0 0 1 35 72" />
      <path d="M 165 48 A 15 15 0 0 0 165 72" />
      {/* Corner Arcs */}
      <path d="M 10 15 A 5 5 0 0 1 15 10" />
      <path d="M 10 105 A 5 5 0 0 0 15 110" />
      <path d="M 190 15 A 5 5 0 0 0 185 10" />
      <path d="M 190 105 A 5 5 0 0 1 185 110" />
      
      {/* Tactical arrows and positions (X and O) */}
      <circle cx="45" cy="40" r="4" strokeWidth="2" />
      <circle cx="65" cy="80" r="4" strokeWidth="2" />
      <circle cx="85" cy="60" r="4" strokeWidth="2" />
      
      <path d="M 141 76 L 149 84 M 149 76 L 141 84" stroke="currentColor" strokeWidth="2" />
      <path d="M 121 36 L 129 44 M 129 36 L 121 44" stroke="currentColor" strokeWidth="2" />
      
      <path d="M 89 60 Q 115 50 135 70" stroke="var(--color-neon)" strokeWidth="1.5" strokeDasharray="3,3" />
      <path d="M 135 70 L 135 65 M 135 70 L 130 70" stroke="var(--color-neon)" strokeWidth="1.5" />
    </svg>
  );
}

function TacticalCrown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="w-full max-w-[200px] h-auto mx-auto text-[var(--color-neon)] opacity-90 drop-shadow-[0_0_8px_rgba(var(--color-neon-glow-rgb),0.3)]"
      {...props}
    >
      <path
        d="M 30 100 L 40 40 L 80 75 L 100 30 L 120 75 L 160 40 L 170 100 Z"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="30" y1="90" x2="170" y2="90" strokeWidth="2" />
      <rect x="50" y="93" width="10" height="4" rx="1" fill="currentColor" />
      <rect x="95" y="93" width="10" height="4" rx="1" fill="currentColor" />
      <rect x="140" y="93" width="10" height="4" rx="1" fill="currentColor" />
      
      <circle cx="40" cy="40" r="5" fill="currentColor" />
      <circle cx="80" cy="75" r="3" fill="currentColor" />
      <circle cx="100" cy="30" r="6" fill="currentColor" />
      <circle cx="120" cy="75" r="3" fill="currentColor" />
      <circle cx="160" cy="40" r="5" fill="currentColor" />
      
      <path d="M 70 25 L 70 35 M 65 30 L 75 30" strokeWidth="1" />
      <path d="M 135 25 L 135 35 M 130 30 L 140 30" strokeWidth="1" />
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
  illustration: ComponentType<SVGProps<SVGSVGElement>>;
  kicker: string;
  desc: string;
  cta: string;
  tour?: string;
  accent?: boolean;
};

function BetsHub() {
  const tiles: Tile[] = [
    {
      to: "/matches",
      illustration: TacticalPitch,
      kicker: "Market №01",
      desc: "Back a side. Fade the crowd. Match-by-match calls with live odds.",
      cta: "Matches",
      tour: "bet-button",
      accent: true,
    },
    {
      to: "/tournament-winner",
      illustration: TacticalCrown,
      kicker: "Market №02",
      desc: "One pick. One champion. Lock your outright before the field tightens.",
      cta: "World Champions",
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
        {/* Editorial intro */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            Markets · Open
          </div>
          <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">
            Pick your <span className="text-[var(--color-neon)]">market</span>.
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
                className={`relative overflow-hidden border bg-[var(--color-surface-2)] transition-colors h-full flex flex-col justify-between ${
                  t.accent
                    ? "border-[var(--color-neon)]/25 hover:border-[var(--color-neon)]/60"
                    : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/40"
                }`}
              >
                <Corner pos="tl" />
                <Corner pos="tr" />
                <Corner pos="bl" />
                <Corner pos="br" />

                <div>
                  {/* stencil header band */}
                  <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                      {t.kicker}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                      {String(i + 1).padStart(2, "0")} / {String(tiles.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="px-5 pb-2 pt-6 flex flex-col items-center justify-center text-center">
                    {/* The drawing replaces the words "Matches" and "Tournament Winner" */}
                    <div className="w-full flex items-center justify-center min-h-[130px] py-2">
                      <t.illustration className="h-28 w-auto text-[var(--color-neon)] transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-muted)] px-2">
                      {t.desc}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3">
                  <div
                    className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-all ${
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
