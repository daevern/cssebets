import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/matches/")({
  head: () => ({ meta: [{ title: "Markets — CSSEBets" }] }),
  component: MatchesPage,
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

type Tab = "live" | "upcoming" | "completed";

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
    away: Math.round((inv.a / s) * 100),
  };
}

function TeamFlag({ name }: { name: string }) {
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

function timeChip(m: Match, now: number) {
  if (m.status === "live") return "LIVE · 2nd Half · 68'";
  if (m.status === "finished") return "Full time";
  const d = new Date(m.kickoff_at);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${t}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

function MatchesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMatchesForUsers);
  const now = useTicker(30_000);
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await listFn()) as Match[],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("markets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () =>
        qc.invalidateQueries({ queryKey: ["matches"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { live, upcoming, completed } = useMemo(() => {
    const arr = data ?? [];
    const horizon = now + 48 * 60 * 60 * 1000;
    const l: Match[] = []; const u: Match[] = []; const c: Match[] = [];
    for (const m of arr) {
      if (m.status === "finished") { c.push(m); continue; }
      if (m.status === "live") { l.push(m); continue; }
      const k = new Date(m.kickoff_at).getTime();
      if (k >= now && k <= horizon) u.push(m);
    }
    const sortAsc = (a: Match, b: Match) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
    l.sort(sortAsc); u.sort(sortAsc); c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [data, now]);

  const list =
    tab === "live" ? live :
    tab === "upcoming" ? upcoming :
    completed;

  return (
    <div className="flex flex-col gap-5 px-4 pt-5">
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
            <MarketCard key={m.id} match={m} now={now} />
          ))}
        </div>
      )}
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

function MarketCard({ match, now }: { match: Match; now: number }) {
  const live = match.status === "live";
  const pct = toPct(match.reference_odds);
  const isTop = live;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        isTop ? "border-[var(--neon)]/40" : "border-[var(--color-surface-border)] hover:border-[var(--neon)]/30"
      }`}
    >
      {isTop && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 60% at 50% 0%, rgba(34,224,107,0.08), transparent 60%)",
          }}
        />
      )}

      <div className="relative p-4">
        {/* Meta row */}
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className={live ? "flex items-center gap-1.5 text-[var(--neon)]" : "text-[var(--ink-muted)]"}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--neon)] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              </span>
            )}
            {timeChip(match, now)}
          </span>
          <span className="text-[var(--ink-muted)]">FIFA World Cup 2026</span>
        </div>

        {/* Teams rows */}
        <div className="mt-3 flex flex-col gap-2.5">
          <TeamRow name={match.home_team} pct={pct?.home ?? null} mult={match.reference_odds?.home ?? null} tone="home" score={live || match.status === "finished" ? match.home_score : null} />
          <TeamRow name={match.away_team} pct={pct?.away ?? null} mult={match.reference_odds?.away ?? null} tone="away" score={live || match.status === "finished" ? match.away_score : null} />
        </div>

        {/* CTA */}
        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            isTop
              ? "bg-[var(--neon)] text-[#04140A] group-hover:translate-y-[-1px]"
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
  name, pct, mult, tone, score,
}: {
  name: string; pct: number | null; mult: number | null; tone: "home" | "away"; score: number | null;
}) {
  const color = tone === "home" ? "text-rose-400" : "text-[var(--neon)]";
  const borderColor = tone === "home" ? "border-rose-400/40" : "border-[var(--neon)]/40";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <TeamFlag name={name} />
        <span className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {score != null && (
          <span className="font-display text-[20px] font-bold tabular-nums text-[var(--ink)]">{score}</span>
        )}
        {pct != null && (
          <div className="flex flex-col items-end">
            <span className={`rounded-full border ${borderColor} px-3 py-1 text-[13px] font-bold tabular-nums ${color}`}>
              {pct}%
            </span>
            {mult != null && (
              <span className="mt-0.5 text-[10px] tabular-nums text-[var(--ink-muted)]">{mult.toFixed(2)}x</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
