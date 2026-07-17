import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFootballFlags } from "@/features/football/football.functions";

type Category = {
  key: string;
  label: string;
  to?: string;
  soon?: boolean;
  flag?: string; // when set, item unlocks only if this feature flag is true
  matchPathPrefix?: string; // used to compute active state for detail routes
};

const CATEGORIES: Category[] = [
  { key: "world-cup-2026", label: "World Cup 2026", to: "/matches" },
  { key: "premier-league", label: "Premier League", to: "/football/epl", flag: "epl_enabled", matchPathPrefix: "/football/epl" },
  { key: "la-liga", label: "La Liga", to: "/football/la-liga", flag: "la_liga_enabled", matchPathPrefix: "/football/la-liga" },
  { key: "serie-a", label: "Serie A", to: "/football/serie-a", flag: "serie_a_enabled", matchPathPrefix: "/football/serie-a" },
  { key: "ucl", label: "UCL", to: "/football/ucl", flag: "ucl_enabled", matchPathPrefix: "/football/ucl" },
  { key: "f1", label: "Formula 1", to: "/f1", matchPathPrefix: "/f1" },
  { key: "ufc", label: "UFC", to: "/ufc", matchPathPrefix: "/ufc" },
  { key: "nba", label: "NBA", soon: true },
];


export function CategoryRail() {
  const { pathname } = useLocation();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const flagsFetcher = useServerFn(listFootballFlags);
  const { data: flags } = useQuery({
    queryKey: ["sports-feature-flags"],
    queryFn: () => flagsFetcher(),
    staleTime: 60_000,
  });

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  const resolved = CATEGORIES.map((c) => {
    if (c.flag && flags && !flags[c.flag]) return { ...c, soon: true, to: undefined };
    return c;
  });

  const isActive = (c: Category) => {
    if (c.soon || !c.to) return false;
    const prefix = c.matchPathPrefix ?? c.to;
    return pathname === c.to || pathname === prefix || pathname.startsWith(prefix + "/");
  };

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

      <div
        className="flex h-full items-center gap-1 overflow-x-auto px-4 sm:px-6 md:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >

        {resolved.map((c) => {
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
