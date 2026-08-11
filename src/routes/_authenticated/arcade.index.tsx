import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";
import { CsseWordmark } from "@/components/brand/CsseMark";
import tilePlinko from "@/assets/arcade/tile-plinko.jpg";
import tileRoulette from "@/assets/arcade/tile-roulette.jpg";
import tileTreasure from "@/assets/arcade/tile-treasure.jpg";
import tileBlackjack from "@/assets/arcade/tile-blackjack.jpg";
import tileRps from "@/assets/arcade/tile-rps.jpg";

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
  { key: "plinko" as const, to: "/arcade/plinko", label: "Plinko", tile: tilePlinko },
  { key: "roulette" as const, to: "/arcade/roulette", label: "Roulette", tile: tileRoulette },
  { key: "treasure" as const, to: "/arcade/treasure", label: "Treasure Grid", tile: tileTreasure },
  { key: "blackjack" as const, to: "/arcade/blackjack", label: "Blackjack", tile: tileBlackjack },
  { key: "rps" as const, to: "/arcade/rps", label: "Rock Paper Scissors", tile: tileRps },
];

function ArcadeLobby() {
  const [howTo, setHowTo] = useState<null | keyof typeof HOW_TO_PLAY>(null);

  return (
    <div className="space-y-4">
      <h1 className="flex items-baseline gap-2 text-lg font-black uppercase tracking-[0.14em] text-[var(--color-ink)]">
        <CsseWordmark size={20} />
        <span>Classic&rsquo;s</span>
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {GAMES.map(({ key, to, label, tile }) => (
          <article key={key} className="group relative">
            <Link
              to={to}
              aria-label={`Play ${label}`}
              className="relative block aspect-[4/5] overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-1"
            >
              <img
                src={tile}
                alt={`${label} tile`}
                width={832}
                height={1024}
                loading="lazy"
                className="absolute inset-0 h-full w-full scale-[1.02] object-cover transition-transform duration-500 group-hover:scale-[1.09]"
              />

              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 22%, rgba(0,0,0,0) 45%)",
                }}
              />

              <div className="absolute inset-x-0 bottom-0 px-2.5 pb-3 text-center">
                <h2 className="text-[13px] font-black uppercase leading-[1.15] tracking-[0.02em] text-white">
                  {label}
                </h2>
                <div className="mt-1 flex justify-center">
                  <CsseWordmark size={9} className="opacity-90" />
                </div>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setHowTo(key)}
              aria-label={`How to play ${label}`}
              className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur transition-colors hover:bg-black/65 hover:text-white"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>

      <HowToPlayDialog
        open={howTo !== null}
        onOpenChange={(v) => !v && setHowTo(null)}
        game={howTo ?? "plinko"}
        content={HOW_TO_PLAY[howTo ?? "plinko"]}
      />
    </div>
  );
}
