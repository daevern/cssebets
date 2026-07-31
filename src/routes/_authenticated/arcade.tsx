import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Gamepad2, Trophy, Target, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — cssebets" },
      {
        name: "description",
        content: "Plinko drops, Mini Roulette spins and Treasure Grid rounds — provably fair.",
      },
      { property: "og:title", content: "Arcade — cssebets" },
      {
        property: "og:description",
        content: "Plinko drops, Mini Roulette spins and Treasure Grid rounds — provably fair.",
      },
    ],
  }),
  component: ArcadeLayout,
});

const TABS = [
  { to: "/arcade", label: "Lobby", Icon: Trophy },
  { to: "/arcade/plinko", label: "Plinko", Icon: Gamepad2 },
  { to: "/arcade/roulette", label: "Roulette", Icon: Target },
  { to: "/arcade/treasure", label: "Treasure", Icon: Gem },
] as const;

function ArcadeLayout() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-24 pt-3 md:px-6 md:pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--color-neon)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            Arcade
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            / Provably fair
          </span>
        </div>
      </header>

      <nav
        aria-label="Arcade sections"
        className="relative -mx-3 mb-4 h-11 border-b border-[var(--color-surface-border)] md:-mx-6"
      >
        <div className="flex h-full items-center gap-1 overflow-x-auto whitespace-nowrap px-3 md:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "inline-flex h-full shrink-0 items-center gap-1.5 border-b-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors",
                  active
                    ? "border-[var(--color-neon)] text-[var(--color-neon)]"
                    : "border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
