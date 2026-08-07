import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpCircle, Zap, Flame, Gem, Spade, Swords } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";
import plinkoPoster from "@/assets/arcade/plinko-poster.jpg";
import roulettePoster from "@/assets/arcade/roulette-poster.jpg";
import treasurePoster from "@/assets/arcade/treasure-poster.jpg";
import blackjackPoster from "@/assets/arcade/blackjack-poster.jpg";
import rpsPoster from "@/assets/arcade/rps-poster.jpg";

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
    poster: plinkoPoster,
    accent: "34 224 107",
  },
  {
    key: "roulette" as const,
    to: "/arcade/roulette",
    label: "Roulette",
    tag: "37 pockets",
    TagIcon: Flame,
    poster: roulettePoster,
    accent: "244 63 94",
  },
  {
    key: "treasure" as const,
    to: "/arcade/treasure",
    label: "Treasure Grid",
    tag: "Cash out anytime",
    TagIcon: Gem,
    poster: treasurePoster,
    accent: "251 191 36",
  },
  {
    key: "blackjack" as const,
    to: "/arcade/blackjack",
    label: "Blackjack",
    tag: "Pays 3:2",
    TagIcon: Spade,
    poster: blackjackPoster,
    accent: "56 130 246",
  },
  {
    key: "rps" as const,
    to: "/arcade/rps",
    label: "Rock Paper Scissors",
    tag: "Instant reveal",
    TagIcon: Swords,
    poster: rpsPoster,
    accent: "34 211 238",
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
        {GAMES.map(({ key, to, label, tag, TagIcon, poster, accent }) => (
          <article key={key} className="group relative">
            <Link
              to={to}
              aria-label={`Play ${label}`}
              className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-[#05070a] transition-transform duration-300 hover:-translate-y-1"
              style={{ boxShadow: `0 10px 30px -14px rgba(${accent} / 0.55)` }}
            >
              <img
                src={poster}
                alt={`${label} game poster`}
                width={768}
                height={1024}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.07]"
              />

              {/* bottom scrim for the title plate */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(3,5,8,0.95) 0%, rgba(3,5,8,0.7) 22%, rgba(3,5,8,0.05) 52%, rgba(3,5,8,0.35) 100%)",
                }}
              />

              {/* accent edge light */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-[62px] h-px opacity-70"
                style={{
                  background: `linear-gradient(90deg, transparent, rgb(${accent}), transparent)`,
                }}
              />

              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-white backdrop-blur">
                <TagIcon className="h-2.5 w-2.5" style={{ color: `rgb(${accent})` }} />
                {tag}
              </span>

              <div className="absolute inset-x-0 bottom-0 z-10 px-2.5 pb-3 text-center">
                <h2 className="text-[13px] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  {label}
                </h2>
                <p
                  className="mt-1 text-[8px] font-black uppercase tracking-[0.34em]"
                  style={{ color: `rgb(${accent} / 0.85)` }}
                >
                  cssebets
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setHowTo(key)}
              aria-label={`How to play ${label}`}
              className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80"
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
