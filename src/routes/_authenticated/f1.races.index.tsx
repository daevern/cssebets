import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import { PageFooter } from "@/components/ui/page-footer";
import { F1Badge } from "@/components/brand/SportBadge";
import { listF1Races, getF1Race } from "@/features/f1/f1.functions";
import { teamFlagUrl } from "@/lib/country-flags";

export const Route = createFileRoute("/_authenticated/f1/races/")({
  head: () => ({ meta: [{ title: "F1 Races — CSSEBets" }] }),
  component: F1RacesPage,
});

type RaceRow = {
  id: string;
  round: number;
  name: string;
  circuit: string;
  country: string | null;
  starts_at: string;
  status: string;
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

function CountryFlag({ country, w = 56, h = 36 }: { country?: string | null; w?: number; h?: number }) {
  const url = country ? teamFlagUrl(country, 160) : null;
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[9px] font-bold uppercase text-[var(--color-ink)]"
        style={{ width: w, height: h }}
      >
        {(country ?? "").slice(0, 3)}
      </div>
    );
  }
  return (
    <img src={url} alt={country ?? ""} className="object-cover" style={{ width: w, height: h }} loading="lazy" />
  );
}

function timeChip(iso: string, status: string, now: number) {
  if (status === "in_progress") return "LIVE";
  if (status === "finished") return "Full time";
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const t = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${t}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

function F1RacesPage() {
  const listFn = useServerFn(listF1Races);
  const now = useTicker(30_000);
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data, isLoading } = useQuery({
    queryKey: ["f1-races-all"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const races: RaceRow[] = data?.races ?? [];
  const season = data?.season ?? new Date().getUTCFullYear();

  const { live, upcoming, completed } = useMemo(() => {
    const l: RaceRow[] = [];
    const u: RaceRow[] = [];
    const c: RaceRow[] = [];
    for (const r of races) {
      if (r.status === "in_progress") { l.push(r); continue; }
      if (r.status === "finished") { c.push(r); continue; }
      u.push(r);
    }
    const asc = (a: RaceRow, b: RaceRow) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    l.sort(asc); u.sort(asc); c.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [races]);

  const list = tab === "live" ? live : tab === "upcoming" ? upcoming : completed;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden bg-[var(--surface)] px-4 pt-5 pb-24">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-[var(--color-ink-muted)]">
        <Link to="/matches" className="hover:text-[var(--color-ink)]">Sports</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <Link to="/f1" className="hover:text-[var(--color-ink)]">F1</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span className="text-[var(--color-ink)]">{season} Races</span>
      </nav>

      <div className="grid grid-cols-3 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-1">
        <TabBtn active={tab === "live"} onClick={() => setTab("live")} label="Live" count={live.length} tone="live" />
        <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")} label="Upcoming" count={upcoming.length || undefined} />
        <TabBtn active={tab === "completed"} onClick={() => setTab("completed")} label="Completed" count={completed.length || undefined} />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--color-ink-muted)]">
          {tab === "live" ? "No Grands Prix are live right now." : "No races in this view."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((r) => (
            <RaceCard key={r.id} race={r} now={now} />
          ))}
        </div>
      )}

      <PageFooter />
    </div>
  );
}

function TabBtn({
  active, onClick, label, count, tone,
}: { active: boolean; onClick: () => void; label: string; count?: number; tone?: "live" }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold tracking-tight transition-colors ${
        active ? "bg-[var(--surface-3)] text-[var(--color-ink)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      }`}
    >
      {tone === "live" && active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />}
      <span className={tone === "live" && active ? "text-[var(--color-neon)]" : ""}>{label}</span>
      {count != null && count > 0 && (
        <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
          active ? "bg-[var(--color-neon)] text-[#04140A]" : "bg-[var(--surface-3)] text-[var(--color-ink-muted)]"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function useRaceTop(raceId: string) {
  const getRace = useServerFn(getF1Race);
  return useQuery({
    queryKey: ["f1-race-preview", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    staleTime: 60_000,
  });
}

function topContenders(data: any, count = 2) {
  if (!data) return [];
  const winners = (data.markets ?? []).filter((m: any) => m.market_type === "race_winner");
  if (!winners.length) return [];
  const invSum = winners.reduce((s: number, m: any) => s + 1 / Number(m.odds), 0) || 1;
  const driverByKey = Object.fromEntries((data.drivers ?? []).map((d: any) => [d.driver_key, d]));
  return winners
    .slice()
    .sort((a: any, b: any) => Number(a.odds) - Number(b.odds))
    .slice(0, count)
    .map((m: any) => {
      const drv = driverByKey[m.selection_key];
      return {
        label: drv?.name ?? m.label,
        pct: Math.round(((1 / Number(m.odds)) / invSum) * 100),
        odds: Number(m.odds),
      };
    });
}

function RaceCard({ race, now }: { race: RaceRow; now: number }) {
  const live = race.status === "in_progress";
  const q = useRaceTop(race.id);
  const top = topContenders(q.data, 2);

  return (
    <Link
      to="/f1/races/$raceId"
      params={{ raceId: race.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live ? "border-rose-500/50 hover:border-rose-500/70" : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/30"
      }`}
    >
      {live && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(100% 60% at 50% 0%, rgba(244,63,94,0.10), transparent 60%)" }}
        />
      )}
      <div className="relative p-4">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "flex items-center gap-1.5 text-[var(--color-ink-muted)]"}>
            {live ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            ) : (
              <F1Badge size={32} />
            )}
            {timeChip(race.starts_at, race.status, now)}
          </span>
          <span className="text-[var(--color-ink-muted)]">Round {race.round}</span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <CountryFlag country={race.country} w={56} h={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[16px] font-bold tracking-tight text-[var(--color-ink)]">
              {race.name}
            </div>
            <div className="truncate text-[11px] text-[var(--color-ink-muted)]">{race.circuit}</div>
          </div>
        </div>

        {top.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {top.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{d.label}</span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[12px] font-bold tabular-nums ${
                    i === 0
                      ? "border-rose-400/40 text-rose-400"
                      : "border-[var(--color-neon)]/40 text-[var(--color-neon)]"
                  }`}
                >
                  {d.pct}%
                </span>
              </div>
            ))}
          </div>
        )}

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[var(--color-surface-border)] text-[var(--color-neon)] group-hover:border-[var(--color-neon)]/40"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
