import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronRight, Ticket, TrendingUp } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Matchday — CSSEBets" },
      { name: "description", content: "Today's featured football markets. Open a market and lock your prediction." },
    ],
  }),
  component: HomePage,
});

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  stage: string | null;
  reference_odds: { home: number; draw: number; away: number } | null;
};

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function toPct(odds: { home: number; draw: number; away: number } | null) {
  if (!odds) return null;
  const inv = { h: 1 / odds.home, d: 1 / odds.draw, a: 1 / odds.away };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    draw: Math.round((inv.d / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function TeamFlag({ name, size = 56 }: { name: string; size?: number }) {
  const url = teamFlagUrl(name, 320);
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
        style={{ width: size, height: size * 0.7 }}
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
      style={{ width: size, height: size * 0.72 }}
      loading="lazy"
    />
  );
}

function statusLabel(m: Match, now: number) {
  if (m.status === "live") return "LIVE";
  if (m.status === "finished") return "Full time";
  const diff = new Date(m.kickoff_at).getTime() - now;
  if (diff <= 0) return "Starting";
  const d = new Date(m.kickoff_at);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}

function HomePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMatchesForUsers);
  const now = useTicker(30_000);
  const { user } = useAuth();
  const uid = user?.id;

  const { data } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await listFn()) as Match[],
    refetchInterval: 60_000,
  });

  const { data: picks } = useQuery({
    queryKey: ["dashboard-active-picks", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, status, points, virtual_stake, potential_return")
        .eq("user_id", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; status: string; points: number; virtual_stake: number; potential_return: number;
      }>;
    },
  });

  const { data: historyCount = 0 } = useQuery({
    queryKey: ["dashboard-history-count", uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid!)
        .neq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const stakeOf = (p: { points: number; virtual_stake: number }) =>
    Number(p.virtual_stake ?? 0) || Number(p.points ?? 0);
  const liveCount = picks?.length ?? 0;
  const totalRisked = picks?.reduce((s, p) => s + stakeOf(p), 0) ?? 0;
  const expectedPayout = picks?.reduce((s, p) => s + Number(p.potential_return ?? 0), 0) ?? 0;
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  useEffect(() => {
    const ch = supabase
      .channel("home-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () =>
        qc.invalidateQueries({ queryKey: ["matches"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { featured, trending } = useMemo(() => {
    const arr = data ?? [];
    const live = arr.filter((m) => m.status === "live");
    const upcoming = arr
      .filter((m) => m.status !== "finished" && new Date(m.kickoff_at).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    const featured = upcoming[0] ?? live[0] ?? null;
    const trending = [...live, ...upcoming.slice(0, 6)]
      .filter((m) => m.id !== featured?.id)
      .slice(0, 8);
    return { featured, trending };
  }, [data, now]);

  const displayName =
    (user?.user_metadata as any)?.full_name?.split(" ")[0] ||
    (user?.user_metadata as any)?.username ||
    user?.email?.split("@")[0] ||
    "player";

  return (
    <div className="flex flex-col gap-8 px-4 pt-5">
      {/* Header — stencil greeting matching wallet/payout/picks */}
      <header className="space-y-2">
        <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight text-[var(--ink)] md:text-4xl">
          Welcome, <span className="text-[var(--neon)]">{displayName}</span>
        </h1>
      </header>

      {/* Upcoming Fixtures — small chip strip */}
      {trending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
                Upcoming Fixtures
              </h2>
              
            </div>
            <Link
              to="/matches"
              className="flex items-center gap-1 text-[12px] font-semibold text-[var(--neon)]"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {trending.map((m) => (
              <TrendingChip key={m.id} match={m} now={now} />
            ))}
          </div>
        </section>
      )}

      {/* Next fixture — single card matching matches/markets style */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              Next Fixture
            </h2>
            
          </div>
        </div>
        {featured ? (
          <FeaturedMarketCard match={featured} now={now} />
        ) : (
          <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
            No fixtures on the slate yet — check back closer to kickoff.
          </div>
        )}
      </section>



      {/* Your Position — picks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
              <Ticket className="h-4 w-4 text-[var(--neon)]" />
              Your Position
            </h2>
            {liveCount > 0 && (
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{liveCount} in play</p>
            )}
          </div>
        </div>

        <article className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-5">
          {liveCount > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock label="Total stake" value={fmt(totalRisked)} unit="pts" />
                <StatBlock label="Expected payout" value={fmt(expectedPayout)} unit="pts" accent icon={<TrendingUp className="h-3 w-3" />} />
              </div>
              <Link to="/my-predictions" className="mt-4 block">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-colors hover:border-[var(--neon)] hover:text-[var(--neon)]"
                >
                  <span>Watch your picks</span>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </>
          ) : historyCount > 0 ? (
            <BenchSlider historyCount={historyCount} />
          ) : (
            <>
              <div className="flex justify-center pb-2">
                <SubsBench className="h-28 w-auto" />
              </div>
              <p className="text-center font-display text-xl font-bold leading-tight tracking-tight">
                You're on the bench.
              </p>
              <p className="mx-auto mt-1.5 max-w-xs text-center text-sm text-[var(--ink-muted)]">
                Get on the team sheet now.
              </p>
              <Link to="/bets" className="mt-4 block">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--neon)]/40 bg-[var(--neon)]/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--neon)] transition-colors hover:bg-[var(--neon)]/10"
                >
                  <span>Get in the game</span>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </>
          )}
        </article>
      </section>

      

      <PageFooter />
    </div>
  );
}

/* ------------ Subs bench SVG (empty state) ------------ */
function SubsBench(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mx-auto w-full max-w-[200px] h-auto text-[var(--neon)] opacity-90"
      {...props}
    >
      <path d="M 20 38 L 30 22 L 170 22 L 180 38 Z" strokeWidth="2" />
      <line x1="20" y1="38" x2="180" y2="38" strokeWidth="2" />
      <line x1="55" y1="22" x2="50" y2="38" strokeDasharray="2,2" />
      <line x1="100" y1="22" x2="100" y2="38" strokeDasharray="2,2" />
      <line x1="145" y1="22" x2="150" y2="38" strokeDasharray="2,2" />
      <line x1="28" y1="38" x2="28" y2="80" />
      <line x1="172" y1="38" x2="172" y2="80" />
      <rect x="28" y="72" width="144" height="10" strokeWidth="2" fill="currentColor" fillOpacity="0.08" />
      <line x1="40" y1="82" x2="40" y2="100" strokeWidth="2" />
      <line x1="100" y1="82" x2="100" y2="100" strokeWidth="2" />
      <line x1="160" y1="82" x2="160" y2="100" strokeWidth="2" />
      <circle cx="60" cy="58" r="7" strokeWidth="2" />
      <path d="M 48 72 Q 60 62 72 72" strokeWidth="2" />
      <circle cx="100" cy="56" r="7" strokeWidth="2" />
      <path d="M 88 72 Q 100 60 112 72" strokeWidth="2" />
      <circle cx="140" cy="58" r="7" strokeWidth="2" />
      <path d="M 128 72 Q 140 62 152 72" strokeWidth="2" />
      <line x1="10" y1="100" x2="190" y2="100" strokeWidth="2" />
      <circle cx="178" cy="104" r="4" strokeWidth="1.5" />
    </svg>
  );
}

function TacticalClipboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mx-auto w-full max-w-[200px] h-auto text-[var(--neon)] opacity-90"
      {...props}
    >
      <rect x="55" y="18" width="90" height="92" strokeWidth="2" fill="currentColor" fillOpacity="0.04" />
      <rect x="82" y="10" width="36" height="14" strokeWidth="2" fill="currentColor" fillOpacity="0.12" />
      <line x1="88" y1="14" x2="112" y2="14" strokeWidth="2" />
      <line x1="55" y1="34" x2="145" y2="34" strokeDasharray="3,3" />
      <line x1="64" y1="48" x2="120" y2="48" strokeWidth="1.5" />
      <circle cx="132" cy="48" r="5" strokeWidth="2" />
      <path d="M 129 48 L 131 50 L 135 46" strokeWidth="2" />
      <line x1="64" y1="66" x2="120" y2="66" strokeWidth="1.5" />
      <circle cx="132" cy="66" r="5" strokeWidth="2" />
      <path d="M 129 63 L 135 69 M 135 63 L 129 69" strokeWidth="2" />
      <line x1="64" y1="84" x2="120" y2="84" strokeWidth="1.5" />
      <circle cx="132" cy="84" r="5" strokeWidth="2" />
      <line x1="128" y1="84" x2="136" y2="84" strokeWidth="2" />
      <line x1="64" y1="100" x2="136" y2="100" strokeDasharray="2,3" />
    </svg>
  );
}

function StatBlock({
  label, value, unit, accent, icon,
}: {
  label: string; value: string; unit: string; accent?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${accent ? "border-[var(--neon)]/40 bg-[var(--neon)]/[0.04]" : "border-[var(--color-surface-border)] bg-[var(--surface-3)]/40"}`}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${accent ? "text-[var(--neon)]" : "text-[var(--ink-muted)]"}`}>
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`font-display text-2xl font-bold tabular-nums ${accent ? "text-[var(--neon)]" : "text-[var(--ink)]"}`}>{value}</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${accent ? "text-[var(--neon)]/70" : "text-[var(--ink-muted)]"}`}>{unit}</span>
      </div>
    </div>
  );
}

function BenchSlider({ historyCount }: { historyCount: number }) {
  const [idx, setIdx] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => setStartX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) setIdx((i) => Math.max(0, Math.min(1, i + (dx < 0 ? 1 : -1))));
    setStartX(null);
  };

  return (
    <div>
      <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          <div className="w-full shrink-0 px-1">
            <div className="flex justify-center pb-2">
              <SubsBench className="h-28 w-auto" />
            </div>
            <p className="text-center font-display text-xl font-bold leading-tight tracking-tight">
              You're on the bench.
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-center text-sm text-[var(--ink-muted)]">
              Get on the team sheet now.
            </p>
            <Link to="/bets" className="mt-4 block">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-[var(--neon)]/40 bg-[var(--neon)]/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--neon)] transition-colors hover:bg-[var(--neon)]/10"
              >
                <span>Get in the game</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </Link>
          </div>

          <div className="w-full shrink-0 px-1">
            <div className="flex justify-center pb-2">
              <TacticalClipboard className="h-28 w-auto" />
            </div>
            <p className="text-center font-display text-xl font-bold leading-tight tracking-tight">
              Read the tape.
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-center text-sm text-[var(--ink-muted)]">
              {historyCount.toLocaleString("en-US")} settled {historyCount === 1 ? "pick" : "picks"} on record.
            </p>
            <Link to="/my-predictions" className="mt-4 block">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-colors hover:border-[var(--neon)] hover:text-[var(--neon)]"
              >
                <span>View picks history</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIdx(0)}
          className={`text-[10px] font-bold uppercase tracking-[0.22em] transition-colors ${idx === 0 ? "text-[var(--ink-muted)]/40" : "text-[var(--ink-muted)] hover:text-[var(--neon)]"}`}
        >
          ‹ Bet
        </button>
        <div className="flex items-center gap-1.5">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 transition-all ${idx === i ? "w-6 bg-[var(--neon)]" : "w-1.5 bg-[var(--color-surface-border)]"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIdx(1)}
          className={`text-[10px] font-bold uppercase tracking-[0.22em] transition-colors ${idx === 1 ? "text-[var(--ink-muted)]/40" : "text-[var(--ink-muted)] hover:text-[var(--neon)]"}`}
        >
          History ›
        </button>
      </div>
    </div>
  );
}

function twoWayPct(odds: { home: number; draw: number; away: number } | null) {
  if (!odds) return null;
  const inv = { h: 1 / odds.home, d: 1 / odds.draw, a: 1 / odds.away };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function timeChip(m: Match, now: number) {
  if (m.status === "live") return "LIVE · 2nd Half · 68'";
  if (m.status === "finished") return "Full time";
  const d = new Date(m.kickoff_at);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay
    ? `Today · ${t}`
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

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

function FeaturedMarketCard({ match, now }: { match: Match; now: number }) {
  const live = match.status === "live";
  const pct = twoWayPct(match.reference_odds);
  const showCornerAccent = !live;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live
          ? "border-rose-500/50 hover:border-rose-500/70"
          : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/40"
      } ${showCornerAccent ? "next-fixture-corner" : ""}`}
    >
      {live && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 60% at 50% 0%, rgba(244,63,94,0.10), transparent 60%)",
          }}
        />
      )}


      <div className="relative p-4">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "text-[var(--ink-muted)]"}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            )}
            {timeChip(match, now)}
          </span>
          <span className="text-[var(--ink-muted)]">FIFA World Cup 2026</span>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <TeamRow
            name={match.home_team}
            pct={pct?.home ?? null}
            mult={match.reference_odds?.home ?? null}
            tone="home"
            score={live || match.status === "finished" ? match.home_score : null}
          />
          <TeamRow
            name={match.away_team}
            pct={pct?.away ?? null}
            mult={match.reference_odds?.away ?? null}
            tone="away"
            score={live || match.status === "finished" ? match.away_score : null}
          />
        </div>

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[#F5C042]/50 text-[#F5C042] group-hover:border-[#F5C042]"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function TeamRowFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <div className="grid h-9 w-14 place-items-center bg-[var(--surface-3)] text-[9px] font-bold uppercase text-[var(--ink)]">
        {name.slice(0, 3)}
      </div>
    );
  }
  return <img src={url} alt={`${name} flag`} className="h-9 w-14 object-cover" loading="lazy" />;
}

function TeamRow({
  name, pct, mult, tone, score,
}: {
  name: string; pct: number | null; mult: number | null; tone: "home" | "away"; score: number | null;
}) {
  const color = tone === "home" ? "text-rose-400" : "text-[var(--neon)]";
  const borderColor = tone === "home" ? "border-rose-400/40" : "border-[var(--neon)]/40";
  const barColor = tone === "home" ? "bg-rose-400" : "bg-[var(--neon)]";
  const barGlow = tone === "home" ? "shadow-[0_0_6px_rgba(251,113,133,0.55)]" : "shadow-[0_0_6px_rgba(34,224,107,0.55)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TeamRowFlag name={name} />
        <span className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{name}</span>
      </div>
      {pct != null && (
        <div className="hidden sm:block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className={`h-full rounded-full ${barColor} ${barGlow} transition-[width] duration-500`}
            style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        {score != null && (
          <span className="font-display text-[20px] font-bold tabular-nums text-[var(--ink)]">{score}</span>
        )}
        {pct != null && (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <div className="sm:hidden h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className={`h-full rounded-full ${barColor} ${barGlow} transition-[width] duration-500`}
                  style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                />
              </div>
              <span className={`rounded-full border ${borderColor} px-3 py-1 text-[13px] font-bold tabular-nums ${color}`}>
                {pct}%
              </span>
            </div>
            {mult != null && (
              <span className="mt-0.5 text-[10px] tabular-nums text-[var(--ink-muted)]">{mult.toFixed(2)}x</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}



function threeWayPct(odds: { home: number; draw: number; away: number } | null) {
  if (!odds) return null;
  const inv = { h: 1 / odds.home, d: 1 / odds.draw, a: 1 / odds.away };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    draw: Math.round((inv.d / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function ChipFlag({ name, size = 26 }: { name: string; size?: number }) {
  const url = teamFlagUrl(name, 320);
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
        style={{ width: size, height: size * 0.7 }}
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
      style={{ width: size, height: size * 0.72 }}
      loading="lazy"
    />
  );
}

function abbrev(name: string) {
  const stops: Record<string, string> = {
    "United States": "USA", "United Kingdom": "UK", "Bosnia & Herzegovina": "BIH",
  };
  if (stops[name]) return stops[name];
  return name.length <= 4 ? name.toUpperCase() : name.slice(0, 3).toUpperCase();
}

function TrendingChip({ match, now }: { match: Match; now: number }) {
  const live = match.status === "live";
  const pct = threeWayPct(match.reference_odds);
  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className={`shrink-0 rounded-xl border bg-[var(--surface-2)] px-3 py-3 transition-colors ${
        live ? "border-rose-500/50 hover:border-rose-500/70" : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/50"
      }`}
      style={{ width: 172 }}
    >
      <div className="flex items-center gap-1.5">
        <ChipFlag name={match.home_team} />
        <span className="text-[10px] font-bold text-[var(--ink-muted)]">·</span>
        <ChipFlag name={match.away_team} />
      </div>
      <div className="mt-2 text-[12px] font-bold tracking-tight text-[var(--ink)]">
        {abbrev(match.home_team)} vs {abbrev(match.away_team)}
      </div>
      {live ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400">
          <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" /> LIVE
        </div>
      ) : (
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {statusLabel(match, now)}
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
    </Link>
  );
}
