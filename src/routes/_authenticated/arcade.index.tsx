import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { HowToPlayDialog, HOW_TO_PLAY } from "@/components/arcade/HowToPlayDialog";
import { CsseWordmark } from "@/components/brand/CsseMark";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import tilePlinko from "@/assets/arcade/tile-plinko.jpg";
import tileRoulette from "@/assets/arcade/tile-roulette.jpg";
import tileTreasure from "@/assets/arcade/tile-treasure.jpg";
import tileBlackjack from "@/assets/arcade/tile-blackjack.jpg";
import tileRps from "@/assets/arcade/tile-rps.jpg";
import tileHilo from "@/assets/arcade/tile-hilo.jpg";
import tileDice from "@/assets/arcade/tile-dice.jpg";
import tileWheel from "@/assets/arcade/tile-wheel.jpg";
import tileKeno from "@/assets/arcade/tile-keno.jpg";
import tileCrash from "@/assets/arcade/tile-crash.jpg";
import tileTowers from "@/assets/arcade/tile-towers.jpg";
import tilePoker from "@/assets/arcade/tile-poker.jpg";

export const Route = createFileRoute("/_authenticated/arcade/")({
  head: () => ({
    meta: [
      { title: "CSSE Originals — Arcade | cssebets" },
      {
        name: "description",
        content:
          "Five house originals — flat, minimal, provably fair. Server decides every payout.",
      },
      { property: "og:title", content: "CSSE Originals — Arcade | cssebets" },
      {
        property: "og:description",
        content:
          "Plinko, Roulette, Treasure Grid, Blackjack and Rock–Paper–Scissors — CSSE Originals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArcadeLobby,
});

const GAMES: {
  key: ArcadeGameKey;
  to: string;
  label: string;
  blurb: string;
  tile: string;
}[] = [
  {
    key: "plinko",
    to: "/arcade/plinko",
    label: "Plinko",
    blurb: "Drop · bounce · land",
    tile: tilePlinko,
  },
  {
    key: "roulette",
    to: "/arcade/roulette",
    label: "Roulette",
    blurb: "Layout · spin · pocket",
    tile: tileRoulette,
  },
  {
    key: "treasure",
    to: "/arcade/treasure",
    label: "Treasure Grid",
    blurb: "Dig · dodge · collect",
    tile: tileTreasure,
  },
  {
    key: "blackjack",
    to: "/arcade/blackjack",
    label: "Blackjack",
    blurb: "Hit · stand · beat dealer",
    tile: tileBlackjack,
  },
  {
    key: "rps",
    to: "/arcade/rps",
    label: "Rock Paper Scissors",
    blurb: "Commit · reveal · climb",
    tile: tileRps,
  },
  {
    key: "hilo",
    to: "/arcade/hilo",
    label: "Hi-Lo",
    blurb: "Call the next card · climb the ladder",
    tile: tileHilo,
  },
  {
    key: "dice",
    to: "/arcade/dice",
    label: "Dice",
    blurb: "Set the band · roll the machine",
    tile: tileDice,
  },
  {
    key: "wheel",
    to: "/arcade/wheel",
    label: "Fortune Wheel",
    blurb: "Pick a risk table · watch it land",
    tile: tileWheel,
  },
  {
    key: "keno",
    to: "/arcade/keno",
    label: "Keno",
    blurb: "Mark your numbers · watch the draw",
    tile: tileKeno,
  },
  {
    key: "crash",
    to: "/arcade/crash",
    label: "Crash",
    blurb: "Ride the curve · bank before it busts",
    tile: tileCrash,
  },
  {
    key: "towers",
    to: "/arcade/towers",
    label: "Dragon Towers",
    blurb: "Climb the rows · dodge the dragons",
    tile: tileTowers,
  },
  {
    key: "poker",
    to: "/arcade/poker",
    label: "Video Poker",
    blurb: "Hold what helps · draw the rest",
    tile: tilePoker,
  },

];

function ArcadeLobby() {
  const [howTo, setHowTo] = useState<null | ArcadeGameKey>(null);

  return (
    <div className="space-y-5">
      <header className="space-y-2 border-b border-[var(--color-surface-border)] pb-4">
        <div className="flex items-baseline gap-2">
          <CsseWordmark size={22} />
          <h1 className="font-display text-lg font-black uppercase tracking-[0.16em] text-[var(--color-ink)]">
            Originals
          </h1>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {GAMES.map(({ key, to, label, blurb, tile }) => {
          const t = ARCADE_THEMES[key];
          return (
            <article key={key} className="group relative">
              <Link
                to={to}
                aria-label={`Play ${label}`}
                className="relative block aspect-[4/5] overflow-hidden rounded-[12px] border transition-opacity hover:opacity-95"
                style={{ borderColor: t.hud.plaqueBorder }}
              >
                <img
                  src={tile}
                  alt=""
                  width={832}
                  height={1024}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 28%, rgba(0,0,0,0) 52%)",
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 px-2.5 pb-3 text-center">
                  <div className="flex justify-center">
                    <CsseWordmark size={13} />
                  </div>

                  <h2 className="mt-0.5 text-[13px] font-black uppercase leading-[1.15] tracking-[0.04em] text-white">
                    {label}
                  </h2>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/65">
                    {blurb}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setHowTo(key)}
                aria-label={`How to play ${label}`}
                className="absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-black/55 text-white/85 transition-colors hover:text-white"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </article>
          );
        })}
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
