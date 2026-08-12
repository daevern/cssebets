import { useEffect, useRef, useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ArcadeTableRail } from "@/components/arcade/ArcadeTableRail";
import { arcadeTableGame } from "@/lib/arcade/table-mode";

export const Route = createFileRoute("/_authenticated/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — cssebets" },
      {
        name: "description",
        content: "Plinko drops, Roulette spins and Treasure Grid rounds — provably fair.",
      },
      { property: "og:title", content: "Arcade — cssebets" },
      {
        property: "og:description",
        content: "Plinko drops, Roulette spins and Treasure Grid rounds — provably fair.",
      },
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

/** Per-game ambient wash so the page itself becomes the cabinet, not a card on a page. */
const AMBIENT: Record<string, string> = {
  plinko:
    "radial-gradient(120% 70% at 50% -6%, #1b2a6b 0%, #0d1330 42%, var(--color-bg, #07080d) 100%)",
  treasure:
    "radial-gradient(120% 70% at 50% -6%, #3f1273 0%, #1b0733 44%, var(--color-bg, #07080d) 100%)",
  roulette:
    "radial-gradient(120% 70% at 50% -6%, #0f7a46 0%, #072317 44%, var(--color-bg, #07080d) 100%)",
  blackjack:
    "radial-gradient(120% 70% at 50% -6%, #0d5a38 0%, #06180f 44%, var(--color-bg, #07080d) 100%)",
  rps: "radial-gradient(120% 70% at 50% -6%, #2a1160 0%, #100a26 44%, var(--color-bg, #07080d) 100%)",
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
    <div className="relative w-full">
      {/* Full-bleed ambient backdrop — the game's world fills the viewport edge to edge. */}
      {ambient && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 transition-[background] duration-500"
          style={{ background: ambient }}
        />
      )}

      {/* Side "cabinet" dressing — turns the empty gutters into part of the room:
          angled light beams, a faint dot grid and an edge vignette. */}
      {ambient && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,.55) 1px, transparent 1.2px)",
              backgroundSize: "22px 22px",
              maskImage:
                "linear-gradient(90deg, #000 0%, transparent 26%, transparent 74%, #000 100%)",
              WebkitMaskImage:
                "linear-gradient(90deg, #000 0%, transparent 26%, transparent 74%, #000 100%)",
            }}
          />
          <div
            className="absolute -left-24 top-0 h-full w-[45vw] rotate-[8deg] opacity-[0.20]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, var(--color-neon) 45%, transparent 100%)",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute -right-24 top-0 h-full w-[45vw] -rotate-[8deg] opacity-[0.20]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, var(--color-neon) 55%, transparent 100%)",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(0,0,0,.55) 100%)",
            }}
          />
        </div>
      )}



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


