import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";
import iconPlinko from "@/assets/arcade/icon-plinko.png";
import iconRoulette from "@/assets/arcade/icon-roulette.png";
import iconTreasure from "@/assets/arcade/icon-treasure.png";
import iconBlackjack from "@/assets/arcade/icon-blackjack.png";
import iconRps from "@/assets/arcade/icon-rps.png";

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
    icon: iconPlinko,
    grad: "linear-gradient(160deg,#1b4d8f 0%,#0f2f61 55%,#0a1e42 100%)",
    glow: "rgba(96,165,250,0.45)",
  },
  {
    key: "roulette" as const,
    to: "/arcade/roulette",
    label: "Roulette",
    icon: iconRoulette,
    grad: "linear-gradient(160deg,#b3283f 0%,#7c1730 55%,#4a0e20 100%)",
    glow: "rgba(248,113,113,0.42)",
  },
  {
    key: "treasure" as const,
    to: "/arcade/treasure",
    label: "Treasure Grid",
    icon: iconTreasure,
    grad: "linear-gradient(160deg,#7a4fd6 0%,#4f2f9e 55%,#2b1a5e 100%)",
    glow: "rgba(196,181,253,0.42)",
  },
  {
    key: "blackjack" as const,
    to: "/arcade/blackjack",
    label: "Blackjack",
    icon: iconBlackjack,
    grad: "linear-gradient(160deg,#155e4b 0%,#0d4034 55%,#08241f 100%)",
    glow: "rgba(52,211,153,0.42)",
  },
  {
    key: "rps" as const,
    to: "/arcade/rps",
    label: "Rock Paper Scissors",
    icon: iconRps,
    grad: "linear-gradient(160deg,#2d3f8f 0%,#1d2a63 55%,#131a3f 100%)",
    glow: "rgba(129,140,248,0.42)",
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
        {GAMES.map(({ key, to, label, icon, grad, glow }) => (
          <article key={key} className="group relative">
            <Link
              to={to}
              aria-label={`Play ${label}`}
              className="relative flex aspect-[4/5] flex-col items-center justify-center overflow-hidden rounded-2xl px-3 pb-4 pt-5 transition-transform duration-200 hover:-translate-y-1"
              style={{ background: grad }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[34%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
                style={{ background: glow }}
              />

              <img
                src={icon}
                alt=""
                width={816}
                height={816}
                loading="lazy"
                className="relative h-[46%] w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-105"
              />

              <div className="relative mt-auto w-full text-center">
                <h2 className="text-[13px] font-black uppercase leading-[1.15] tracking-[0.02em] text-white">
                  {label}
                </h2>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.3em] text-white/55">
                  cssebets
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setHowTo(key)}
              aria-label={`How to play ${label}`}
              className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
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
