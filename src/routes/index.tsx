import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, TrendingUp, TrendingDown, Info, Users, LineChart, LifeBuoy } from "lucide-react";
import { CsseLogo } from "@/components/brand/CsseMark";
import { teamFlagUrl } from "@/lib/country-flags";
import { getLandingData, type LandingNextMatch } from "@/lib/landing.functions";
import { recordHomeView } from "@/lib/trust-public.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — FIFA World Cup 2026 Prediction Markets" },
      {
        name: "description",
        content:
          "Try live prediction markets on FIFA World Cup 2026 fixtures. Pick an outcome, set your stake and see your potential payout — no signup needed to explore.",
      },
      { property: "og:title", content: "CSSEBets — Prediction Markets for the World Cup" },
      {
        property: "og:description",
        content:
          "Try prediction markets on FIFA World Cup 2026 fixtures — pick, stake, and see your potential payout.",
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
    draw: Math.round((inv.d / s) * 100),
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

        {/* Interactive Market Demo — replaces the old "Next Fixture" section */}
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              Try the Market
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <Info className="h-3 w-3" /> Demo mode
            </span>
          </div>
          {featured ? (
            <MarketDemoCard match={featured} now={now} />
          ) : (
            <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
              No fixtures on the slate right now — check back closer to kickoff.
            </div>
          )}
        </section>
      </main>

      {/* Bottom nav — landing only. Links to existing routes. */}
      <LandingBottomNav />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive Market Demo                                             */
/* ------------------------------------------------------------------ */

type Outcome = "home" | "draw" | "away";

// Deterministic pseudo-movement based on match id + minute — no randomness across renders.
function movementSeries(seed: string, base: number, points = 24) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < points; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const wobble = ((h & 0xffff) / 0xffff - 0.5) * (base * 0.08);
    v = Math.max(1.05, base + wobble * Math.sin(i / 3));
    out.push(v);
  }
  out[out.length - 1] = base;
  return out;
}

function Sparkline({ values, tone }: { values: number[]; tone: "home" | "draw" | "away" }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const w = 100, h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "home" ? "var(--neon)" :
    tone === "draw" ? "#F5C042" :
    "rgb(244,63,94)";
  const first = values[0], last = values[values.length - 1];
  const dir = last < first ? "down" : "up"; // odds falling = more favored
  return (
    <div className="flex items-center gap-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-16" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {dir === "down"
        ? <TrendingDown className="h-3 w-3" style={{ color: stroke }} />
        : <TrendingUp className="h-3 w-3" style={{ color: stroke }} />}
    </div>
  );
}

function MarketDemoCard({ match, now }: { match: NonNullable<LandingNextMatch>; now: number }) {
  const pct = toPct(match.homeOdds, match.drawOdds, match.awayOdds);
  const [outcome, setOutcome] = useState<Outcome>("home");
  const [stake, setStake] = useState<number>(100);

  useEffect(() => { setOutcome("home"); setStake(100); }, [match.id]);

  const oddsFor = (o: Outcome) =>
    o === "home" ? match.homeOdds : o === "draw" ? match.drawOdds : match.awayOdds;
  const pctFor = (o: Outcome) =>
    !pct ? null : o === "home" ? pct.home : o === "draw" ? pct.draw : pct.away;

  const selectedOdds = oddsFor(outcome);
  const payout = selectedOdds != null ? Math.round(stake * selectedOdds) : null;
  const profit = payout != null ? payout - stake : null;

  const outcomes: { key: Outcome; label: string; sub: string; tone: "home" | "draw" | "away" }[] = [
    { key: "home", label: abbrev(match.homeTeam), sub: match.homeTeam, tone: "home" },
    { key: "draw", label: "DRAW", sub: "Level after 90'", tone: "draw" },
    { key: "away", label: abbrev(match.awayTeam), sub: match.awayTeam, tone: "away" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)]">
      {/* atmospheric glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 0% 0%, rgba(34,224,107,0.08), transparent 55%), radial-gradient(120% 60% at 100% 100%, rgba(245,192,66,0.06), transparent 55%)",
        }}
      />

      <div className="relative p-4">
        {/* header */}
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="text-[var(--ink-muted)]">{timeChip(match.kickoffAt, now)}</span>
          <span className="text-[var(--ink-muted)]">Match Winner · 90'</span>
        </div>

        {/* teams strip */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface)]/60 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <TeamFlag name={match.homeTeam} w={40} />
            <span className="truncate text-[13px] font-bold tracking-tight">{match.homeTeam}</span>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">vs</span>
          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            <span className="truncate text-[13px] font-bold tracking-tight">{match.awayTeam}</span>
            <TeamFlag name={match.awayTeam} w={40} />
          </div>
        </div>

        {/* outcome selector — three cards with sparkline "market movement" */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {outcomes.map((o) => {
            const odds = oddsFor(o.key);
            const p = pctFor(o.key);
            const active = outcome === o.key;
            const series = movementSeries(`${match.id}-${o.key}`, odds ?? 2, 24);
            const toneRing =
              o.tone === "home" ? "border-[var(--neon)]/60 shadow-[0_0_18px_rgba(34,224,107,0.25)]" :
              o.tone === "draw" ? "border-[#F5C042]/70 shadow-[0_0_18px_rgba(245,192,66,0.25)]" :
              "border-rose-400/60 shadow-[0_0_18px_rgba(244,63,94,0.25)]";
            return (
              <button
                key={o.key}
                onClick={() => setOutcome(o.key)}
                className={`group relative rounded-xl border bg-[var(--surface)]/70 p-2.5 text-left transition-all ${
                  active ? toneRing : "border-[var(--color-surface-border)] hover:border-[var(--ink-muted)]/40"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  {o.key === "draw" ? "Draw" : o.key === "home" ? "Home" : "Away"}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-bold tracking-tight text-[var(--ink)]">
                  {o.label}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[18px] font-black tabular-nums leading-none text-[var(--ink)]">
                    {odds != null ? odds.toFixed(2) : "—"}
                  </span>
                  {p != null && (
                    <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">{p}%</span>
                  )}
                </div>
                <div className="mt-1.5">
                  <Sparkline values={series} tone={o.tone} />
                </div>
              </button>
            );
          })}
        </div>

        {/* stake + payout */}
        <div className="mt-4 rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface)]/60 p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ink-muted)]">
            <span>Your stake</span>
            <span className="tabular-nums">{stake} pts</span>
          </div>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--neon)]"
            aria-label="Stake"
          />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[50, 100, 250, 500].map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                  stake === v
                    ? "border-[var(--neon)]/70 text-[var(--neon)]"
                    : "border-[var(--color-surface-border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--color-surface-border)] pt-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Potential payout
              </div>
              <div className="mt-0.5 text-[24px] font-black tabular-nums leading-none text-[var(--neon)]">
                {payout != null ? `${payout.toLocaleString()}` : "—"}
                <span className="ml-1 text-[11px] font-semibold text-[var(--ink-muted)]">pts</span>
              </div>
            </div>
            {profit != null && (
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  Profit
                </div>
                <div className="mt-0.5 text-[14px] font-bold tabular-nums text-[var(--ink)]">
                  +{profit.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/register"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--neon)] py-3 text-[14px] font-bold tracking-tight text-[#04140A] transition-all hover:shadow-[0_0_22px_rgba(34,224,107,0.5)]"
        >
          Register to place this bet <ArrowUpRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-center text-[10px] text-[var(--ink-muted)]">
          Demo only — sign up to play with real prediction points.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing bottom nav — reuses existing routes                         */
/* ------------------------------------------------------------------ */
const LANDING_NAV = [
  { to: "/trust-center", label: "About", Icon: Info },
  { to: "/trust-center", label: "Community", Icon: Users },
  { to: "/status", label: "Performance", Icon: LineChart },
  { to: "/support", label: "Help", Icon: LifeBuoy },
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
