import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { listFootballMatches } from "../football.functions";
import {
  FOOTBALL_COMPETITIONS,
  competitionLogoUrl,
  type FootballCompetitionCode,
} from "../config/footballCompetitions";
import type { FootballMatch } from "../types/football";

type Tab = "live" | "upcoming" | "completed";

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function toPct(odds: { home: number; draw: number; away: number } | null | undefined) {
  if (!odds) return null;
  const inv = { h: 1 / odds.home, d: 1 / odds.draw, a: 1 / odds.away };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function TeamCrest({ name, logo }: { name: string; logo: string | null }) {
  if (!logo) {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[9px] font-bold uppercase text-[var(--ink)]">
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt={`${name} crest`}
      className="h-9 w-9 shrink-0 object-contain"
      loading="lazy"
    />
  );
}

function timeChip(m: FootballMatch, now: number) {
  if (m.status === "live")
    return m.liveMinute != null ? `LIVE · ${m.liveMinute}'` : "LIVE";
  if (m.status === "halftime") return "LIVE · Half time";
  if (m.status === "finished") return "Full time";
  const d = new Date(m.kickoffAt);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay
    ? `Today · ${t}`
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

export function FootballCompetitionPage({ code }: { code: FootballCompetitionCode }) {
  const cfg = FOOTBALL_COMPETITIONS[code];
  const fetcher = useServerFn(listFootballMatches);
  const now = useTicker(30_000);
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data, isLoading } = useQuery({
    queryKey: ["football-matches", code],
    queryFn: () => fetcher({ data: { competition: code, limit: 100 } }),
    refetchInterval: 60_000,
  });

  const { live, upcoming, completed } = useMemo(() => {
    const arr = data?.matches ?? [];
    const backstop = now - 7 * 24 * 60 * 60 * 1000;
    const l: FootballMatch[] = [];
    const u: FootballMatch[] = [];
    const c: FootballMatch[] = [];
    for (const m of arr) {
      const k = new Date(m.kickoffAt).getTime();
      if (m.status === "finished") {
        if (k >= backstop) c.push(m);
        continue;
      }
      if (m.status === "live" || m.status === "halftime") {
        l.push(m);
        continue;
      }
      if (k >= now) u.push(m);
    }
    const asc = (a: FootballMatch, b: FootballMatch) =>
      new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
    l.sort(asc);
    u.sort(asc);
    c.sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());

    // Only show the current matchweek. Prefer the round/matchweek label when the
    // feed provides one (e.g. "Regular Season - 1"); otherwise fall back to
    // clustering by kickoff date until a gap of more than 3 days.
    const firstRound = (u[0] as any)?.round as string | null | undefined;
    let cluster: FootballMatch[] = [];
    if (firstRound) {
      cluster = u.filter((m) => ((m as any).round ?? null) === firstRound);
    } else {
      const GAP = 3 * 24 * 60 * 60 * 1000;
      for (const m of u) {
        const k = new Date(m.kickoffAt).getTime();
        if (!cluster.length) {
          cluster.push(m);
          continue;
        }
        const prev = new Date(cluster[cluster.length - 1]!.kickoffAt).getTime();
        if (k - prev > GAP) break;
        cluster.push(m);
      }
    }
    return { live: l, upcoming: cluster, completed: c };

  }, [data, now]);


  const list = tab === "live" ? live : tab === "upcoming" ? upcoming : completed;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden bg-[var(--surface)] px-4 pt-5">
      {/* Competition identity */}
      <header className="flex min-w-0 items-center gap-3">
        <img
          src={competitionLogoUrl(cfg.apiFootballLeagueId)}
          alt={`${cfg.displayName} logo`}
          className="h-10 w-10 shrink-0 object-contain"
          loading="lazy"
        />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[20px] font-bold tracking-tight text-[var(--ink)]">
            {cfg.displayName}
          </h1>
          <p className="truncate text-[11px] font-semibold text-[var(--ink-muted)]">
            {cfg.country} · Upcoming fixtures
          </p>
        </div>
      </header>

      {/* Segmented tabs */}
      <div className="grid grid-cols-3 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-1">
        <TabBtn active={tab === "live"} onClick={() => setTab("live")} label="Live" count={live.length} tone="live" />
        <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")} label="Upcoming" count={upcoming.length > 0 ? upcoming.length : undefined} />
        <TabBtn active={tab === "completed"} onClick={() => setTab("completed")} label="Completed" count={completed.length > 0 ? completed.length : undefined} />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--neon)]" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
          {tab === "live" ? "No matches are live right now." : "No fixtures in this view."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((m) => (
            <MarketCard key={m.id} match={m} now={now} competitionName={cfg.displayName} />
          ))}
        </div>
      )}

      <PageFooter />
    </div>
  );
}

function TabBtn({
  active, onClick, label, count, tone,
}: {
  active: boolean; onClick: () => void; label: string; count?: number; tone?: "live";
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold tracking-tight transition-colors ${
        active
          ? "bg-[var(--surface-3)] text-[var(--ink)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      {tone === "live" && active && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--neon)]" />
      )}
      <span className={tone === "live" && active ? "text-[var(--neon)]" : ""}>{label}</span>
      {count != null && count > 0 && (
        <span
          className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
            active ? "bg-[var(--neon)] text-[#04140A]" : "bg-[var(--surface-3)] text-[var(--ink-muted)]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function MarketCard({
  match, now, competitionName,
}: {
  match: FootballMatch; now: number; competitionName: string;
}) {
  const live = match.status === "live" || match.status === "halftime";
  const pct = toPct(match.referenceOdds);
  const showScore = live || match.status === "finished";

  return (
    <Link
      to="/football/matches/$matchId"
      params={{ matchId: match.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live
          ? "border-rose-500/50 hover:border-rose-500/70"
          : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/30"
      }`}
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
          <span className="truncate pl-2 text-[var(--ink-muted)]">
            {competitionName}
            {match.round ? ` · ${match.round}` : ""}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <TeamRow
            name={match.home.name}
            logo={match.home.logo}
            pct={pct?.home ?? null}
            mult={match.referenceOdds?.home ?? null}
            tone="home"
            score={showScore ? match.home.score : null}
          />
          <TeamRow
            name={match.away.name}
            logo={match.away.logo}
            pct={pct?.away ?? null}
            mult={match.referenceOdds?.away ?? null}
            tone="away"
            score={showScore ? match.away.score : null}
          />
        </div>

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[var(--color-surface-border)] text-[var(--neon)] group-hover:border-[var(--neon)]/40"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function TeamRow({
  name, logo, pct, mult, tone, score,
}: {
  name: string; logo: string | null; pct: number | null; mult: number | null; tone: "home" | "away"; score: number | null;
}) {
  const color = tone === "home" ? "text-rose-400" : "text-[var(--neon)]";
  const borderColor = tone === "home" ? "border-rose-400/40" : "border-[var(--neon)]/40";
  const barColor = tone === "home" ? "bg-rose-400" : "bg-[var(--neon)]";
  const barGlow =
    tone === "home"
      ? "shadow-[0_0_6px_rgba(251,113,133,0.55)]"
      : "shadow-[0_0_6px_rgba(34,224,107,0.55)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TeamCrest name={name} logo={logo} />
        <span className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{name}</span>
      </div>
      {pct != null && (
        <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)] sm:block">
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
              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-3)] sm:hidden">
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
