import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import { listF1Races, getF1Race } from "../f1.functions";
import { teamFlagUrl } from "@/lib/country-flags";

function CountryFlag({ country, size = 20 }: { country?: string | null; size?: number }) {
  const url = country ? teamFlagUrl(country, 80) : null;
  if (!url) {
    return (
      <span
        aria-hidden
        className="inline-grid place-items-center rounded-sm bg-[var(--surface-3)] text-[10px]"
        style={{ width: size * 1.4, height: size }}
      >
        🏁
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={country ?? ""}
      className="inline-block rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      style={{ width: size * 1.4, height: size }}
      loading="lazy"
    />
  );
}


function statusLabel(iso: string, status: string) {
  if (status === "in_progress") return "LIVE";
  if (status === "finished") return "Full time";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${t}`;
  const diffDays = Math.round((d.getTime() - now.getTime()) / (24 * 3600_000));
  if (diffDays > 0 && diffDays <= 7)
    return `${d.toLocaleDateString(undefined, { weekday: "short" })} · ${t}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

/* Driver portrait — the F1 equivalent of UFC's FighterPortrait. */
function DriverPortrait({ url, name, size = 56 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)] object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div
      className="grid place-items-center rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)] text-[11px] font-bold text-[var(--color-ink)]"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

type RaceRow = {
  id: string;
  round: number;
  name: string;
  circuit: string;
  country: string | null;
  starts_at: string;
  status: string;
};

const ROW_TONES = ["home", "away", "draw"] as const;

export function F1SeasonPage() {
  const listRaces = useServerFn(listF1Races);
  const racesQ = useQuery({ queryKey: ["f1-races"], queryFn: () => listRaces(), refetchInterval: 60_000 });

  const races: RaceRow[] = racesQ.data?.races ?? [];
  const season = racesQ.data?.season ?? new Date().getUTCFullYear();

  const { featured, upcoming } = useMemo(() => {
    const open = races
      .filter((r) => r.status === "scheduled" || r.status === "in_progress")
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const [next, ...rest] = open;
    return { featured: next ?? null, upcoming: rest };
  }, [races]);

  if (racesQ.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pt-5 pb-24 text-[var(--color-ink)]">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-gradient-to-r from-red-900/40 to-black px-4 py-2 text-xs font-bold text-white">
          <span className="rounded bg-red-600 px-2 py-0.5 text-[10px]">F1</span>
          Formula 1 · {season} · Race markets
        </div>
        <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-4xl">
          Race-by-race markets
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Predict every Grand Prix. Odds move with the paddock — lock in your call until lights out.
        </p>
      </header>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
              Upcoming Grands Prix
            </h2>
            <Link to="/matches" className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-neon)]">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {upcoming.map((r) => (
              <RaceChip key={r.id} race={r} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
          Next Race
        </h2>
        {featured ? (
          <FeaturedRaceCard race={featured} />
        ) : (
          <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--color-ink-muted)]">
            No upcoming Grands Prix yet. An admin needs to sync the season.
          </div>
        )}
      </section>
    </div>
  );
}

function useRaceContenders(raceId: string) {
  const getRace = useServerFn(getF1Race);
  return useQuery({
    queryKey: ["f1-race-preview", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    staleTime: 60_000,
  });
}

function topContenders(data: any, count = 3) {
  if (!data) return [];
  const winners = (data.markets ?? []).filter((m: any) => m.market_type === "race_winner");
  if (winners.length === 0) return [];
  const invSum = winners.reduce((s: number, m: any) => s + 1 / Number(m.odds), 0) || 1;
  const driverByKey = Object.fromEntries((data.drivers ?? []).map((d: any) => [d.driver_key, d]));
  const teamByKey = Object.fromEntries((data.teams ?? []).map((t: any) => [t.team_key, t]));
  return winners
    .slice()
    .sort((a: any, b: any) => Number(a.odds) - Number(b.odds))
    .slice(0, count)
    .map((m: any) => {
      const drv = driverByKey[m.selection_key];
      const team = drv?.team_key ? teamByKey[drv.team_key] : null;
      return {
        label: drv?.name ?? m.label,
        team: team?.name ?? null,
        photo: drv?.photo_url ?? null,
        pct: Math.round(((1 / Number(m.odds)) / invSum) * 100),
        odds: Number(m.odds),
      };
    });
}

/* Small chip mirroring UFC FightChip */
function RaceChip({ race }: { race: RaceRow }) {
  const q = useRaceContenders(race.id);
  const top = topContenders(q.data, 2);
  const live = race.status === "in_progress";
  return (
    <Link
      to="/f1/races/$raceId"
      params={{ raceId: race.id }}
      className={`shrink-0 rounded-xl border bg-[var(--surface-2)] px-3 py-3 transition-colors ${
        live
          ? "border-rose-500/50 hover:border-rose-500/70"
          : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/50"
      }`}
      style={{ width: 184 }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xl leading-none">{flagFor(race.country)}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          R{race.round}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-bold tracking-tight text-[var(--color-ink)] line-clamp-2">
        {race.name}
      </div>
      {live ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400">
          <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" /> LIVE
        </div>
      ) : (
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          {statusLabel(race.starts_at, race.status)}
        </div>
      )}
      {top.length === 2 ? (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 p-1 text-center">
          {top.map((d: any, i: number) => (
            <div key={i} className={i === 1 ? "border-l border-[var(--color-surface-border)]" : ""}>
              <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--color-ink-muted)] truncate">
                {d.label.split(" ").slice(-1)[0].slice(0, 4).toUpperCase()}
              </div>
              <div className={`text-[11px] font-bold tabular-nums ${i === 0 ? "text-rose-400" : "text-[var(--color-neon)]"}`}>
                {d.pct}%
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

/* Featured card mirroring UFC FeaturedFightCard */
function FeaturedRaceCard({ race }: { race: RaceRow }) {
  const q = useRaceContenders(race.id);
  const top = topContenders(q.data, 3);
  const live = race.status === "in_progress";

  return (
    <Link
      to="/f1/races/$raceId"
      params={{ raceId: race.id }}
      className={`group relative block overflow-hidden rounded-2xl border bg-[var(--surface-2)] transition-colors ${
        live
          ? "border-rose-500/50 hover:border-rose-500/70"
          : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/40"
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
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "text-[var(--color-ink-muted)]"}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            )}
            {statusLabel(race.starts_at, race.status)}
          </span>
          <span className="text-[var(--color-ink-muted)]">Round {race.round}</span>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <span className="text-4xl leading-none">{flagFor(race.country)}</span>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold leading-tight text-[var(--color-ink)]">{race.name}</div>
            <div className="text-xs text-[var(--color-ink-muted)] truncate">{race.circuit}</div>
          </div>
        </div>

        {q.isLoading ? (
          <div className="mt-4 grid h-24 place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : top.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2.5">
            {top.map((d: any, i: number) => (
              <DriverRow
                key={i}
                name={d.label}
                team={d.team}
                photo={d.photo}
                pct={d.pct}
                odds={d.odds}
                tone={ROW_TONES[i] ?? "draw"}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-3 text-xs text-[var(--color-ink-muted)]">
            Odds go live once the paddock arrives.
          </div>
        )}

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-tight transition-transform ${
            live
              ? "bg-rose-500 text-[#160406] group-hover:translate-y-[-1px]"
              : "border border-[var(--color-neon)]/50 bg-[var(--color-neon)]/5 text-[var(--color-neon)] group-hover:translate-y-[-1px] group-hover:bg-[var(--color-neon)]/10"
          }`}
        >
          Open Market <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function DriverRow({
  name,
  team,
  photo,
  pct,
  odds,
  tone,
}: {
  name: string;
  team: string | null;
  photo: string | null;
  pct: number;
  odds: number;
  tone: "home" | "away" | "draw";
}) {
  const color =
    tone === "home" ? "text-rose-400" : tone === "away" ? "text-[var(--color-neon)]" : "text-sky-400";
  const borderColor =
    tone === "home" ? "border-rose-400/40" : tone === "away" ? "border-[var(--color-neon)]/40" : "border-sky-400/40";
  const barColor =
    tone === "home" ? "bg-rose-400" : tone === "away" ? "bg-[var(--color-neon)]" : "bg-sky-400";
  const barGlow =
    tone === "home"
      ? "shadow-[0_0_6px_rgba(251,113,133,0.55)]"
      : tone === "away"
      ? "shadow-[0_0_6px_rgba(34,224,107,0.55)]"
      : "shadow-[0_0_6px_rgba(56,189,248,0.55)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <DriverPortrait url={photo} name={name} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-tight text-[var(--color-ink)]">{name}</div>
          {team && <div className="truncate text-[11px] text-[var(--color-ink-muted)]">{team}</div>}
        </div>
      </div>
      <div className="hidden sm:block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className={`h-full rounded-full ${barColor} ${barGlow} transition-[width] duration-500`}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
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
        <span className="mt-0.5 text-[10px] tabular-nums text-[var(--color-ink-muted)]">{odds.toFixed(2)}x</span>
      </div>
    </div>
  );
}
