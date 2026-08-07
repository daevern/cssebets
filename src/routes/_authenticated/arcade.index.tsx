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
    tag: "Up to 1000x",
    TagIcon: Zap,
    Art: PlinkoArt,
    art: "text-[var(--color-neon)]",
    grad: "from-[color-mix(in_oklab,var(--color-neon)_38%,#0b0e12)] to-[#0b0e12]",
    glow: "bg-[var(--color-neon)]/35",
    ring: "hover:border-[var(--color-neon)]/70",
  },
  {
    key: "roulette" as const,
    to: "/arcade/roulette",
    label: "Roulette",
    tag: "37 pockets",
    TagIcon: Flame,
    Art: RouletteArt,
    art: "text-rose-300",
    grad: "from-rose-500/45 to-[#0b0e12]",
    glow: "bg-rose-500/35",
    ring: "hover:border-rose-400/70",
  },
  {
    key: "treasure" as const,
    to: "/arcade/treasure",
    label: "Treasure Grid",
    tag: "Cash out anytime",
    TagIcon: Gem,
    Art: TreasureArt,
    art: "text-amber-200",
    grad: "from-amber-400/40 to-[#0b0e12]",
    glow: "bg-amber-400/35",
    ring: "hover:border-amber-400/70",
  },
  {
    key: "blackjack" as const,
    to: "/arcade/blackjack",
    label: "Blackjack",
    tag: "Pays 3:2",
    TagIcon: Spade,
    Art: BlackjackArt,
    art: "text-sky-200",
    grad: "from-sky-500/40 to-[#0b0e12]",
    glow: "bg-sky-400/35",
    ring: "hover:border-sky-400/70",
  },
  {
    key: "rps" as const,
    to: "/arcade/rps",
    label: "Rock Paper Scissors",
    tag: "Instant reveal",
    TagIcon: Swords,
    Art: RpsArt,
    art: "text-cyan-200",
    grad: "from-cyan-400/40 to-[#0b0e12]",
    glow: "bg-cyan-400/35",
    ring: "hover:border-cyan-400/70",
  },
];

function ArcadeLobby() {
  const [howTo, setHowTo] = useState<null | keyof typeof HOW_TO_PLAY>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black uppercase tracking-[0.14em] text-[var(--color-ink)]">
        CSSEbets Classic&rsquo;s
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {GAMES.map(({ key, to, label, tag, TagIcon, Art, art, grad, glow, ring }) => (
          <article key={key} className="group relative">
            <Link
              to={to}
              aria-label={`Play ${label}`}
              className={`relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-gradient-to-b ${grad} ${ring} transition-transform duration-300 hover:-translate-y-1`}
            >
              {/* soft halo behind the art */}
              <div
                className={`pointer-events-none absolute left-1/2 top-[34%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl ${glow}`}
              />

              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-white backdrop-blur">
                <TagIcon className="h-2.5 w-2.5" />
                {tag}
              </span>

              {/* game art */}
              <div
                className={`relative flex flex-1 items-center justify-center px-3 pt-7 ${art}`}
              >
                <div className="w-full overflow-hidden rounded-xl transition-transform duration-500 group-hover:scale-[1.06]">
                  <Art />
                </div>
              </div>

              {/* footer plate */}
              <div className="relative z-10 px-2 pb-3 text-center">
                <h2 className="text-[12px] font-black uppercase leading-tight tracking-[0.1em] text-white">
                  {label}
                </h2>
                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.28em] text-white/55">
                  cssebets
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setHowTo(key)}
              aria-label={`How to play ${label}`}
              className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
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

