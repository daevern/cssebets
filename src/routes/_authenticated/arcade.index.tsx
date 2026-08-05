import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, HelpCircle, Zap, Flame, Gem, Spade, Swords } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";
import {
  PlinkoArt,
  RouletteArt,
  TreasureArt,
  BlackjackArt,
  RpsArt,
} from "@/components/arcade/GameArt";

export const Route = createFileRoute("/_authenticated/arcade/")({
  head: () => ({
    meta: [
      { title: "Arcade Lobby — cssebets" },
      {
        name: "description",
        content:
          "Pick a game: Plinko drops, Roulette spins or Treasure Grid runs. Provably fair, instant payouts.",
      },
      { property: "og:title", content: "Arcade Lobby — cssebets" },
      {
        property: "og:description",
        content: "Pick a game: Plinko, Roulette or Treasure Grid. Provably fair, instant payouts.",
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
    tag: "Up to 1000x",
    TagIcon: Zap,
    Art: PlinkoArt,
    art: "text-[var(--color-neon)]",
    frame: "from-[var(--color-neon)]/18 via-[var(--color-surface)]/0 to-transparent",
    ring: "hover:border-[var(--color-neon)]/70",
    cta: "bg-[var(--color-neon)] text-[var(--color-bg)]",
  },
  {
    key: "roulette" as const,
    to: "/arcade/roulette",
    label: "Roulette",
    blurb: "Stack chips across the layout, one pocket decides it all.",
    tag: "37 pockets",
    TagIcon: Flame,
    Art: RouletteArt,
    art: "text-rose-300",
    frame: "from-rose-500/20 via-[var(--color-surface)]/0 to-transparent",
    ring: "hover:border-rose-400/70",
    cta: "bg-rose-500 text-white",
  },
  {
    key: "treasure" as const,
    to: "/arcade/treasure",
    label: "Treasure Grid",
    blurb: "Flip safe tiles, grow the multiplier, bank it before a trap.",
    tag: "Cash out anytime",
    TagIcon: Gem,
    Art: TreasureArt,
    art: "text-amber-200",
    frame: "from-amber-400/20 via-[var(--color-surface)]/0 to-transparent",
    ring: "hover:border-amber-400/70",
    cta: "bg-amber-400 text-[#2a1500]",
  },
  {
    key: "blackjack" as const,
    to: "/arcade/blackjack",
    label: "Blackjack",
    blurb: "Stake your points against the dealer. Hit 21, get paid 3:2.",
    tag: "Free to play",
    TagIcon: Spade,
    Art: BlackjackArt,
    art: "text-sky-200",
    frame: "from-sky-400/20 via-[var(--color-surface)]/0 to-transparent",
    ring: "hover:border-sky-400/70",
    cta: "bg-sky-400 text-[#04121c]",
  },
  {
    key: "rps" as const,
    to: "/arcade/rps",
    label: "Rock–Paper–Scissors",
    blurb: "The computer commits its move first. Pick yours, both reveal at once.",
    tag: "Simultaneous reveal",
    TagIcon: Swords,
    Art: RpsArt,
    art: "text-cyan-200",
    frame: "from-cyan-400/20 via-[var(--color-surface)]/0 to-transparent",
    ring: "hover:border-cyan-400/70",
    cta: "bg-cyan-400 text-[#04161c]",
  },
];

function ArcadeLobby() {
  const [howTo, setHowTo] = useState<null | keyof typeof HOW_TO_PLAY>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black uppercase tracking-[0.14em] text-[var(--color-ink)]">
        CSSEbets Classic&rsquo;s
      </h1>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map(({ key, to, label, blurb, tag, TagIcon, Art, art, frame, ring, cta }) => (
          <article
            key={key}
            className={`group relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]/70 transition-colors ${ring}`}
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${frame}`} />

            <div className="relative flex h-full flex-col p-3">
              <Link
                to={to}
                aria-label={`Play ${label}`}
                className={`relative block aspect-[16/10] overflow-hidden rounded-xl border border-[var(--color-surface-border)] bg-[#0b0e12] ${art}`}
              >
                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.06]">
                  <Art />
                </div>
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur">
                  <TagIcon className="h-3 w-3" />
                  {tag}
                </span>
              </Link>

              <h2 className="mt-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--color-ink)]">
                {label}
              </h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                {blurb}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to={to}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-[11px] font-black uppercase tracking-[0.16em] transition-opacity hover:opacity-90 ${cta}`}
                >
                  <Play className="h-3.5 w-3.5" /> Play
                </Link>
                <button
                  type="button"
                  onClick={() => setHowTo(key)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-surface-border)] text-[11px] font-black uppercase tracking-[0.16em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink)]"
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
