import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Target, Gem, Play, HelpCircle, ShieldCheck } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";

export const Route = createFileRoute("/_authenticated/arcade/")({
  head: () => ({
    meta: [
      { title: "Arcade Lobby — cssebets" },
      {
        name: "description",
        content:
          "Pick a game: Plinko drops, Mini Roulette spins or Treasure Grid runs. Provably fair, instant payouts.",
      },
      { property: "og:title", content: "Arcade Lobby — cssebets" },
      {
        property: "og:description",
        content: "Pick a game: Plinko, Mini Roulette or Treasure Grid. Provably fair, instant payouts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArcadeLobby,
});

const GAMES = [
  {
    key: "plinko" as const,
    to: "/arcade/plinko",
    label: "Plinko",
    blurb: "Drop the ball, ride the bounce into a multiplier bucket.",
    Icon: Gamepad2,
    accent: "from-[var(--color-neon)]/30 via-transparent to-transparent",
  },
  {
    key: "roulette" as const,
    to: "/arcade/roulette",
    label: "Mini Roulette",
    blurb: "Stack chips across the layout and spin a single winning pocket.",
    Icon: Target,
    accent: "from-rose-500/25 via-transparent to-transparent",
  },
  {
    key: "treasure" as const,
    to: "/arcade/treasure",
    label: "Treasure Grid",
    blurb: "Uncover safe tiles, grow the multiplier, cash out before a trap.",
    Icon: Gem,
    accent: "from-amber-400/25 via-transparent to-transparent",
  },
];

function ArcadeLobby() {
  const [howTo, setHowTo] = useState<null | keyof typeof HOW_TO_PLAY>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]/60 p-4">
        <h1 className="text-lg font-black uppercase tracking-[0.14em] text-[var(--color-ink)]">
          Choose your game
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Three quick-play games. Every round is provably fair and settles straight to your wallet.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">
          <ShieldCheck className="h-3.5 w-3.5" /> Provably fair
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map(({ key, to, label, blurb, Icon, accent }) => (
          <article
            key={key}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]/70"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
            <div className="relative flex h-full flex-col p-4">
              <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-bg)]/50">
                <Icon className="h-12 w-12 text-[var(--color-neon)] transition-transform duration-300 group-hover:scale-110" />
              </div>

              <h2 className="mt-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--color-ink)]">
                {label}
              </h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">{blurb}</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to={to}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-neon)] text-[11px] font-black uppercase tracking-[0.16em] text-[var(--color-bg)] transition-opacity hover:opacity-90"
                >
                  <Play className="h-3.5 w-3.5" /> Play
                </Link>
                <button
                  type="button"
                  onClick={() => setHowTo(key)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-surface-border)] text-[11px] font-black uppercase tracking-[0.16em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
                >
                  <HelpCircle className="h-3.5 w-3.5" /> How to play
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <HowToPlayDialog
        open={howTo !== null}
        onOpenChange={(v) => !v && setHowTo(null)}
        content={HOW_TO_PLAY[howTo ?? "plinko"]}
      />
    </div>
  );
}
