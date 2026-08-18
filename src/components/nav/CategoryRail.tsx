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
  { key: "f1", label: "Formula 1", to: "/f1/races", matchPathPrefix: "/f1" },
  { key: "ufc", label: "UFC", to: "/ufc/fights", matchPathPrefix: "/ufc" },
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
      className="relative h-12 w-full overflow-hidden bg-[var(--surface)]"
    >
      {/* Edge fades */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-r from-[var(--surface)] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-[var(--surface)] to-transparent"
      />

      <div
        className="flex h-full items-center gap-6 overflow-x-auto px-4 sm:px-6 md:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >

        {resolved.map((c) => {
          const active = isActive(c);
          const base =
            "flex-shrink-0 flex items-center whitespace-nowrap transition-colors text-[15px] leading-none";

          if (c.soon) {
            return (
              <button
                key={c.key}
                type="button"
                disabled
                aria-label={`${c.label} — coming soon`}
                className={`${base} cursor-not-allowed gap-1.5 font-medium text-[var(--ink-muted)]/50`}
              >
                <span>{c.label}</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]/60">
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
                  ? "font-bold text-white"
                  : "font-medium text-[var(--ink-muted)]/90 hover:text-white"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
