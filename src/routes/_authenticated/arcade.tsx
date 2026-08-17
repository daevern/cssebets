import { useEffect, useRef, useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ArcadeTableRail } from "@/components/arcade/ArcadeTableRail";
import { arcadeTableGame } from "@/lib/arcade/table-mode";
import { arcadeCssVars, ARCADE_THEMES } from "@/lib/arcade/theme";

export const Route = createFileRoute("/_authenticated/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — cssebets" },
      {
        name: "description",
        content:
          "CSSE Originals — Plinko, Roulette, Treasure Grid, Blackjack and Rock–Paper–Scissors. Provably fair points arcade.",
      },
      { property: "og:title", content: "Arcade — cssebets" },
      {
        property: "og:description",
        content:
          "CSSE Originals — five flat, provably fair tables. Server decides every payout.",
      },
          { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArcadeLayout,
});

/**
 * The games render a fixed control console at the bottom of the viewport.
 * Measure it so the page ends exactly where the console begins — no dead
 * scroll space under the footer.
 */
function useConsoleHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let frame = 0;
    let observed: Element | null = null;
    const ro = new ResizeObserver(() => {
      if (observed) setHeight((observed as HTMLElement).offsetHeight);
    });

    const attach = () => {
      const el = document.querySelector("[data-arcade-console]");
      if (el !== observed) {
        if (observed) ro.unobserve(observed);
        observed = el;
        if (el) ro.observe(el);
        setHeight(el ? (el as HTMLElement).offsetHeight : 0);
      }
      frame = window.setTimeout(attach, 400);
    };
    attach();

    return () => {
      window.clearTimeout(frame);
      ro.disconnect();
    };
  }, []);

  return height;
}

/** Per-game ambient wash — flat stage color from house theme. */
const AMBIENT: Record<string, string> = {
  plinko: ARCADE_THEMES.plinko.stageBg,
  treasure: ARCADE_THEMES.treasure.stageBg,
  roulette: ARCADE_THEMES.roulette.stageBg,
  blackjack: ARCADE_THEMES.blackjack.stageBg,
  rps: ARCADE_THEMES.rps.stageBg,
};

function ArcadeLayout() {
  const consoleHeight = useConsoleHeight();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const game = pathname.split("/arcade/")[1]?.split("/")[0] ?? "";
  const tableGame = arcadeTableGame(pathname);
  const ambient = AMBIENT[game] ?? null;

  // Only pad by however much of the console actually covers the content.
  // When the game already ends above the console, the page stays exactly one
  // screen tall — no blank scroll tail.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [spacer, setSpacer] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const bottom = rect.bottom + window.scrollY;
      const slack = Math.max(0, window.innerHeight - bottom);
      setSpacer(Math.max(0, Math.round(consoleHeight - slack)));
    };
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", schedule);
    const poll = window.setInterval(schedule, 400);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
  }, [consoleHeight, pathname]);

  return (
    <div
      className="relative w-full"
      data-arcade-game={tableGame ?? undefined}
      style={tableGame ? arcadeCssVars(tableGame) : undefined}
    >
      {/* Full-bleed ambient backdrop — the game's world fills the viewport edge to edge. */}
      {ambient && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 transition-[background] duration-500"
          style={{ background: ambient }}
        />
      )}

      {/* Flat 2D page: solid ambient only — no blur beams / vignette room. */}



      <div
        ref={contentRef}
        className={
          ambient
            ? // Stages bleed edge-to-edge on mobile; surrounding chrome keeps its gutter.
              "mx-auto w-full max-w-4xl xl:max-w-5xl px-3 pt-2 md:px-6 md:pt-6 [&_.arcade-stage]:max-md:mx-[calc(50%-50vw)] [&_.arcade-stage]:max-md:w-screen [&_.arcade-stage]:max-md:rounded-none [&_.arcade-stage]:max-md:shadow-none [&_.treasure-stage]:max-md:mx-[calc(50%-50vw)] [&_.treasure-stage]:max-md:w-screen [&_.treasure-stage]:max-md:max-w-none [&_.treasure-stage]:max-md:rounded-none"
            : "mx-auto w-full max-w-4xl xl:max-w-5xl px-3 pt-3 md:px-6 md:pt-6"
        }
      >
        {tableGame && <ArcadeTableRail game={tableGame} />}
        <Outlet />
      </div>

      {/* Clears only the part of the console that would cover the game. */}
      <div style={{ height: spacer }} aria-hidden />
    </div>
  );
}


