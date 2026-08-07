import { useEffect, useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageFooter } from "@/components/ui/page-footer";

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

function ArcadeLayout() {
  const consoleHeight = useConsoleHeight();

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-3 md:px-6 md:pt-6">
      <Outlet />

      {/* Spacer clears the fixed console exactly — nothing more. */}
      <div style={{ height: consoleHeight }} aria-hidden />
    </div>

  );
}
