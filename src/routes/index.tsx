import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Info, Users, LineChart, LifeBuoy } from "lucide-react";

import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { teamFlagUrl } from "@/lib/country-flags";
import { getLandingData, type LandingNextMatch } from "@/lib/landing.functions";
import { recordHomeView } from "@/lib/trust-public.functions";
import { MatchAnalyticsScreen } from "@/routes/_authenticated/matches.$matchId";

const FALLBACK_MATCH_ID = "daeb90a9-359a-4aef-bf40-fdc969672448";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets – The FIFA World Cup 2026 Prediction Market" },
      {
        name: "description",
        content:
          "Trade live markets on every match, goal, lineup, and key moment with dynamic, community-driven pricing.",
      },
      { property: "og:title", content: "CSSEBets – The FIFA World Cup 2026 Prediction Market" },
      {
        property: "og:description",
        content:
          "Trade live markets on every match, goal, lineup, and key moment with dynamic, community-driven pricing.",
      },
      { property: "og:url", content: "https://cssebets.com/" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/" }],
  }),
  component: LandingPage,
});

/* ------------------------------------------------------------------ */
/* Data / helpers                                                      */
/* ------------------------------------------------------------------ */

function useLanding() {
  const fn = useServerFn(getLandingData);
  const [data, setData] = useState<{
    nextMatches: LandingNextMatch[];
    stats: { registeredPlayers: number; activeToday: number; betsSettled: number; pointsPaidOut: number };
  } | null>(null);
  useEffect(() => {
    let m = true;
    fn().then((d) => m && setData(d)).catch(() => m && setData({ nextMatches: [], stats: { registeredPlayers: 0, activeToday: 0, betsSettled: 0, pointsPaidOut: 0 } }));
    return () => { m = false; };
  }, [fn]);
  return data;
}

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function timeChip(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${t}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

function abbrev(name: string) {
  const stops: Record<string, string> = {
    "United States": "USA", "United Kingdom": "UK", "Bosnia & Herzegovina": "BIH",
  };
  if (stops[name]) return stops[name];
  return name.length <= 4 ? name.toUpperCase() : name.slice(0, 3).toUpperCase();
}

function threeWayPctFromOdds(h: number | null, d: number | null, a: number | null) {
  if (h == null || d == null || a == null || !(h > 0) || !(d > 0) || !(a > 0)) return null;
  const inv = { h: 1 / h, d: 1 / d, a: 1 / a };
  const s = inv.h + inv.d + inv.a;
  if (!(s > 0)) return null;
  return {
    home: Math.round((inv.h / s) * 100),
    draw: Math.round((inv.d / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function TeamFlag({ name, w = 56 }: { name: string; w?: number }) {
  const url = teamFlagUrl(name, 320);
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[10px] font-bold uppercase text-[var(--ink)]"
        style={{ width: w, height: Math.round(w * 0.7) }}
      >
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="object-cover"
      style={{ width: w, height: Math.round(w * 0.72) }}
      loading="lazy"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function LandingPage() {
  const landing = useLanding();
  const now = useTicker(30_000);
  const trackView = useServerFn(recordHomeView);
  useEffect(() => { trackView({}).catch(() => {}); }, [trackView]);

  const fixtures = useMemo(() => {
    return (landing?.nextMatches ?? []).filter(Boolean) as NonNullable<LandingNextMatch>[];
  }, [landing]);

  const upcoming = useMemo(
    () => fixtures.filter((f) => new Date(f.kickoffAt).getTime() > now),
    [fixtures, now],
  );

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [upcoming.length]);
  const featured = upcoming[idx] ?? upcoming[0] ?? null;
  const analyticsMatchId = featured?.id ?? FALLBACK_MATCH_ID;

  return (
    <div className="relative min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      {/* Minimal top nav — logo + login + register only */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--surface)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-8">
          <Link to="/" aria-label="CSSEBets home" className="shrink-0">
            <CsseLogo size={22} />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              className="rounded-full border border-[var(--color-surface-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/50 hover:text-[var(--neon)] sm:px-4 sm:py-2 sm:text-[13px]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-[var(--neon)] px-3 py-1.5 text-[12px] font-bold text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)] sm:px-4 sm:py-2 sm:text-[13px]"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-4 pb-28 pt-5 md:pb-14">



        {/* Fixtures navigator */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              Upcoming Fixtures
            </h2>
            {upcoming.length > 1 && (
              <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--ink-muted)]">
                <button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="grid h-7 w-7 place-items-center rounded-full border border-[var(--color-surface-border)] transition-colors hover:border-[var(--neon)]/50 disabled:opacity-40"
                  aria-label="Previous fixture"
                >‹</button>
                <span>{idx + 1} / {upcoming.length}</span>
                <button
                  onClick={() => setIdx((i) => Math.min(upcoming.length - 1, i + 1))}
                  disabled={idx >= upcoming.length - 1}
                  className="grid h-7 w-7 place-items-center rounded-full border border-[var(--color-surface-border)] transition-colors hover:border-[var(--neon)]/50 disabled:opacity-40"
                  aria-label="Next fixture"
                >›</button>
              </div>
            )}
          </div>

          {fixtures.length > 0 && (
            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {fixtures.map((f) => {
                const live = new Date(f.kickoffAt).getTime() <= now;
                const active = !live && upcoming[idx]?.id === f.id;
                const pct = threeWayPctFromOdds(f.homeOdds, f.drawOdds, f.awayOdds);
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      const upIdx = upcoming.findIndex((u) => u.id === f.id);
                      if (upIdx >= 0) setIdx(upIdx);
                    }}
                    className={`shrink-0 rounded-xl border bg-[var(--surface-2)] px-3 py-3 text-left transition-colors ${
                      live
                        ? "border-rose-500/50"
                        : active
                          ? "border-[var(--neon)]/60"
                          : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/50"
                    }`}
                    style={{ width: 172 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <TeamFlag name={f.homeTeam} w={26} />
                      <span className="text-[10px] font-bold text-[var(--ink-muted)]">·</span>
                      <TeamFlag name={f.awayTeam} w={26} />
                    </div>
                    <div className="mt-2 text-[12px] font-bold tracking-tight text-[var(--ink)]">
                      {abbrev(f.homeTeam)} vs {abbrev(f.awayTeam)}
                    </div>
                    {live ? (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" /> LIVE
                      </div>
                    ) : (
                      <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        {timeChip(f.kickoffAt, now)}
                      </div>
                    )}
                    {pct ? (
                      <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 p-1 text-center">
                        <div>
                          <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Home</div>
                          <div className="text-[11px] font-bold tabular-nums text-rose-400">{pct.home}%</div>
                        </div>
                        <div className="border-x border-[var(--color-surface-border)]">
                          <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Draw</div>
                          <div className="text-[11px] font-bold tabular-nums text-sky-300">{pct.draw}%</div>
                        </div>
                        <div>
                          <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Away</div>
                          <div className="text-[11px] font-bold tabular-nums text-[var(--neon)]">{pct.away}%</div>
                        </div>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Full match analytics — lifted from /matches/:id, visitor-safe */}
        <section className="mt-6">
          <MatchAnalyticsScreen key={analyticsMatchId} matchId={analyticsMatchId} publicMode />
        </section>


        <footer className="mt-10 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          <Link to="/" className="flex items-center gap-2 hover:text-[var(--ink)]">
            <CsseLogo size={16} />
          </Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </main>


      {/* Bottom nav — landing only. Links to existing routes. */}
      <LandingBottomNav />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing bottom nav — reuses existing routes                         */
/* ------------------------------------------------------------------ */
const LANDING_NAV = [
  { to: "/about", label: "About", Icon: Info },
  { to: "/community", label: "Community", Icon: Users },
  { to: "/performance", label: "Performance", Icon: LineChart },
  { to: "/faq", label: "Help", Icon: LifeBuoy },
] as const;

function LandingBottomNav() {
  return (
    <nav
      aria-label="Landing sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)]/70 bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {LANDING_NAV.map(({ to, label, Icon }) => (
          <Link
            key={label}
            to={to}
            className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight text-[var(--ink-muted)] transition-colors hover:text-[var(--neon)]"
          >
            <Icon className="h-[22px] w-[22px]" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
