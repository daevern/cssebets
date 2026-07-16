import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

type Category = {
  key: string;
  label: string;
  to?: string;
  soon?: boolean;
};

const CATEGORIES: Category[] = [
  { key: "premier-league", label: "Premier League", to: "/matches" },
  { key: "la-liga", label: "La Liga", to: "/matches" },
  { key: "serie-a", label: "Serie A", to: "/matches" },
  { key: "ucl", label: "UCL", to: "/matches" },
  { key: "f1", label: "Formula 1", soon: true },
  { key: "ufc", label: "UFC", soon: true },
  { key: "nba", label: "NBA", soon: true },
];

export function CategoryRail() {
  const { pathname } = useLocation();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // On mount, scroll the active pill into view (auto-scroll behavior).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  const isActive = (c: Category) =>
    !c.soon && !!c.to && (pathname === c.to || pathname.startsWith(c.to + "/"));

  return (
    <nav
      aria-label="Market categories"
      className="relative h-11 w-full overflow-hidden border-b border-[var(--color-surface-border)]/60 bg-[var(--surface)]/95 backdrop-blur-md"
    >
      {/* Edge fades */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-[var(--surface)] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-[var(--surface)] to-transparent"
      />

      <div className="scrollbar-none flex h-full items-center gap-1 overflow-x-auto px-4 sm:px-6 md:px-8">
        {CATEGORIES.map((c) => {
          const active = isActive(c);
          const base =
            "flex-shrink-0 flex items-center h-full px-3.5 gap-2 border-b-2 whitespace-nowrap transition-colors";

          if (c.soon) {
            return (
              <button
                key={c.key}
                type="button"
                disabled
                aria-label={`${c.label} — coming soon`}
                className={`${base} cursor-not-allowed border-transparent opacity-70`}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[#2a2a2a]"
                />
                <span className="text-[13px] font-medium tracking-tight text-[var(--ink-muted)]">
                  {c.label}
                </span>
                <span className="rounded-[2px] bg-[var(--neon)]/10 px-1 py-[1px] text-[8px] font-bold uppercase tracking-tight text-[var(--neon)]">
                  Soon
                </span>
              </button>
            );
          }

          return (
            <Link
              key={c.key}
              ref={active ? activeRef : undefined}
              to={c.to!}
              search={{ league: c.key } as any}
              aria-current={active ? "page" : undefined}
              className={`${base} ${
                active
                  ? "border-[var(--neon)]"
                  : "border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <span
                aria-hidden
                className={
                  active
                    ? "h-1.5 w-1.5 rounded-full bg-[var(--neon)] shadow-[0_0_8px_rgba(34,224,107,0.6)]"
                    : "h-1.5 w-1.5 rounded-full bg-[#333]"
                }
              />
              <span
                className={`text-[13px] tracking-tight ${
                  active
                    ? "font-semibold text-[var(--ink)]"
                    : "font-medium text-[var(--ink-muted)]"
                }`}
              >
                {c.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
