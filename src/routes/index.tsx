import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, LineChart, Users, Activity, HelpCircle } from "lucide-react";
import { CsseLogo } from "@/components/brand/CsseMark";
import { teamFlagUrl } from "@/lib/country-flags";
import { getLandingData, type LandingNextMatch } from "@/lib/landing.functions";
import { recordHomeView } from "@/lib/trust-public.functions";
import {
  CommunityGrowthSection,
  RecentPlatformActivity,
  PayoutPerformanceSection,
  BuildingLongRun,
} from "@/components/landing/TrustSections";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — FIFA World Cup 2026 Prediction Markets" },
      {
        name: "description",
        content:
          "Live odds, community activity and payout performance for the CSSEBets FIFA World Cup 2026 prediction market.",
      },
      { property: "og:title", content: "CSSEBets — Prediction Markets for the World Cup" },
      {
        property: "og:description",
        content:
          "Track live odds, community activity and payout performance in real time.",
      },
    ],
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

function toPct(h: number | null, d: number | null, a: number | null) {
  if (h == null || d == null || a == null) return null;
  const inv = { h: 1 / h, d: 1 / d, a: 1 / a };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
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

  // Fixtures we display in the navigator. Includes live (isLive flag on the client
  // is inferred by kickoff being in the past + not finished — we don't get status
  // from getLandingData, so treat past-kickoff items as live).
  const fixtures = useMemo(() => {
    const list = (landing?.nextMatches ?? []).filter(Boolean) as NonNullable<LandingNextMatch>[];
    return list;
  }, [landing]);

  const upcoming = useMemo(
    () => fixtures.filter((f) => new Date(f.kickoffAt).getTime() > now),
    [fixtures, now],
  );

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [upcoming.length]);
  const featured = upcoming[idx] ?? upcoming[0] ?? null;

  return (
    <div className="relative min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      {/* Minimal top nav — logo + login + register only */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--surface)]/95 backdrop-blur-md">
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
        {/* Fixtures navigator — country A vs country B */}
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

          {/* Horizontal strip of all fixtures (live + upcoming) */}
          {fixtures.length > 0 && (
            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {fixtures.map((f, i) => {
                const live = new Date(f.kickoffAt).getTime() <= now;
                const active = !live && upcoming[idx]?.id === f.id;
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
                          ? "border-[#F5C042]/60"
                          : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/50"
                    }`}
                    style={{ width: 168 }}
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
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Next fixture — featured Kalshi-style card (gold corners) */}
        <section className="mt-6 space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5C042]" />
            Next Fixture
          </h2>
          {featured ? (
            <NextFixtureCard match={featured} now={now} />
          ) : (
            <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
              No fixtures on the slate right now — check back closer to kickoff.
            </div>
          )}
        </section>

        {/* Analytics sections — reuse existing trust surfaces */}
        <div id="community" className="mt-10 scroll-mt-24">
          <CommunityGrowthSection />
        </div>
        <div className="mt-2">
          <RecentPlatformActivity />
        </div>
        <div id="performance" className="scroll-mt-24">
          <PayoutPerformanceSection />
        </div>
        <div id="about" className="scroll-mt-24">
          <BuildingLongRun />
        </div>
        <div id="help" className="mt-6 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-6 text-center scroll-mt-24">
          <h3 className="text-base font-bold text-[var(--ink)]">Need help?</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Reach the CSSEBets team any time.</p>
          <a
            href="mailto:support@cssebets.com"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--neon)] px-4 py-2 text-[13px] font-bold text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
          >
            Contact support <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </main>

      {/* Bottom nav — landing only. 4 anchor links. */}
      <LandingBottomNav />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Next fixture card — gold corners, matches "Next Fixture" on home    */
/* ------------------------------------------------------------------ */
function GoldCorner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t-2 border-l-2",
    tr: "top-0 right-0 border-t-2 border-r-2",
    bl: "bottom-0 left-0 border-b-2 border-l-2",
    br: "bottom-0 right-0 border-b-2 border-r-2",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-5 w-5 border-[#F5C042] ${map[pos]}`}
      style={{ filter: "drop-shadow(0 0 6px rgba(245,192,66,0.45))" }}
    />
  );
}

function NextFixtureCard({ match, now }: { match: NonNullable<LandingNextMatch>; now: number }) {
  const pct = toPct(match.homeOdds, match.drawOdds, match.awayOdds);
  return (
    <Link
      to="/auth"
      className="group relative block overflow-hidden rounded-2xl border border-[#F5C042]/40 bg-[var(--surface-2)] transition-colors hover:border-[#F5C042]/70"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 0% 0%, rgba(245,192,66,0.10), transparent 55%), radial-gradient(120% 60% at 100% 100%, rgba(245,192,66,0.08), transparent 55%)",
        }}
      />
      <GoldCorner pos="tl" />
      <GoldCorner pos="br" />
      <div className="relative p-4">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="text-[var(--ink-muted)]">{timeChip(match.kickoffAt, now)}</span>
          <span className="text-[var(--ink-muted)]">FIFA World Cup 2026</span>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <TeamOddsRow name={match.homeTeam} pct={pct?.home ?? null} mult={match.homeOdds} tone="home" />
          <TeamOddsRow name={match.awayTeam} pct={pct?.away ?? null} mult={match.awayOdds} tone="away" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-[#F5C042]/50 py-3 text-[14px] font-bold tracking-tight text-[#F5C042] transition-colors group-hover:border-[#F5C042]">
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function TeamOddsRow({
  name, pct, mult, tone,
}: {
  name: string; pct: number | null; mult: number | null; tone: "home" | "away";
}) {
  const color = tone === "home" ? "text-rose-400" : "text-[var(--neon)]";
  const borderColor = tone === "home" ? "border-rose-400/40" : "border-[var(--neon)]/40";
  const barColor = tone === "home" ? "bg-rose-400" : "bg-[var(--neon)]";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TeamFlag name={name} w={56} />
        <span className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{name}</span>
      </div>
      {pct != null && (
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-3)] sm:w-24">
            <div className={`h-full rounded-full ${barColor} transition-[width] duration-500`} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
          </div>
          <div className="flex flex-col items-end">
            <span className={`rounded-full border ${borderColor} px-2.5 py-0.5 text-[12px] font-bold tabular-nums ${color}`}>
              {pct}%
            </span>
            {mult != null && (
              <span className="mt-0.5 text-[10px] tabular-nums text-[var(--ink-muted)]">{mult.toFixed(2)}x</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing bottom nav                                                  */
/* ------------------------------------------------------------------ */
const LANDING_NAV = [
  { id: "about", label: "About", Icon: HelpCircle },
  { id: "community", label: "Community", Icon: Users },
  { id: "performance", label: "Performance", Icon: LineChart },
  { id: "help", label: "Help", Icon: Activity },
] as const;

function LandingBottomNav() {
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav
      aria-label="Landing sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)]/70 bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {LANDING_NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => jump(id)}
            className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight text-[var(--ink-muted)] transition-colors hover:text-[var(--neon)]"
          >
            <Icon className="h-[22px] w-[22px]" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
