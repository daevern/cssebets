import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { listF1Races, getF1Race, listF1ChampionshipMarkets, placeF1ChampionshipBet } from "../f1.functions";
import { getMyWallet } from "@/lib/wallet.functions";
import { useAuth } from "@/hooks/use-auth";
import { teamFlagUrl } from "@/lib/country-flags";
import { PageFooter } from "@/components/ui/page-footer";
import { F1Badge } from "@/components/brand/SportBadge";

const MIN_STAKE = 10;
const MAX_STAKE = 50_000;

function CountryFlag({ country, w = 36, h = 24 }: { country?: string | null; w?: number; h?: number }) {
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
    <img
      src={url}
      alt={country ?? ""}
      className="object-cover"
      style={{ width: w, height: h }}
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

type ChampMarket = {
  id: string;
  season: number;
  market_type: string;
  selection_key: string;
  label: string;
  odds: number;
  status: string;
};

export function F1SeasonPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listRaces = useServerFn(listF1Races);
  const listChamp = useServerFn(listF1ChampionshipMarkets);
  const placeChamp = useServerFn(placeF1ChampionshipBet);
  const walletFn = useServerFn(getMyWallet);

  const racesQ = useQuery({ queryKey: ["f1-races"], queryFn: () => listRaces(), refetchInterval: 60_000 });

  const races: RaceRow[] = racesQ.data?.races ?? [];
  const season = racesQ.data?.season ?? new Date().getUTCFullYear();

  const champQ = useQuery({
    queryKey: ["f1-champ-markets", season],
    queryFn: () => listChamp({ data: { season } }),
    enabled: !!season,
    staleTime: 60_000,
  });

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id,
    staleTime: 15_000,
  });
  const balance = Number(wallet.data?.balance ?? 0);

  const [selected, setSelected] = useState<ChampMarket | null>(null);
  const [stake, setStake] = useState("100");

  const placeMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      const stakeValue = Number(stake);
      if (!Number.isFinite(stakeValue) || stakeValue < MIN_STAKE) {
        throw new Error(`Minimum stake is ${MIN_STAKE} points.`);
      }
      if (stakeValue > MAX_STAKE) throw new Error(`Maximum stake is ${MAX_STAKE.toLocaleString()} points.`);
      if (stakeValue > balance) throw new Error("Insufficient points");
      return placeChamp({
        data: {
          marketId: selected.id,
          stake: stakeValue,
          maxOdds: Number(selected.odds) * 1.05,
        },
      });
    },
    onSuccess: () => {
      toast.success("Championship bet locked");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
      qc.invalidateQueries({ queryKey: ["f1-champ-markets", season] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not place bet"),
  });

  const { featured, upcoming } = useMemo(() => {
    const open = races
      .filter((r) => r.status === "scheduled" || r.status === "in_progress")
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const [next, ...rest] = open;
    return { featured: next ?? null, upcoming: rest };
  }, [races]);

  const markets: ChampMarket[] = (champQ.data?.markets ?? []).map((m: any) => ({
    ...m,
    odds: Number(m.odds),
  }));
  const drivers = markets.filter((m) => m.market_type === "drivers");
  const constructors = markets.filter((m) => m.market_type === "constructors");

  const stakeNum = Number(stake) || 0;
  const odds = selected ? Number(selected.odds) : 0;
  const potentialReturn = selected ? stakeNum * odds : 0;
  const overBalance = stakeNum > balance && stakeNum > 0;
  const canSubmit =
    !!selected &&
    !placeMut.isPending &&
    stakeNum >= MIN_STAKE &&
    stakeNum <= MAX_STAKE &&
    !overBalance &&
    balance > 0;

  if (racesQ.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-8 px-4 pt-5 pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-6 text-[var(--color-ink)]"
      style={{ paddingBottom: selected ? "calc(env(safe-area-inset-bottom) + 14rem)" : undefined }}
    >
      <header className="space-y-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-[var(--color-ink-muted)]"
        >
          <Link to="/matches" className="hover:text-[var(--color-ink)]">Sports</Link>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="text-[var(--color-ink)]">F1</span>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="text-[var(--color-ink-muted)]">{season}</span>
        </nav>
      </header>

      <ChampionshipOutrights
        loading={champQ.isLoading}
        drivers={drivers}
        constructors={constructors}
        selectedId={selected?.id ?? null}
        onSelect={(m) => setSelected(m)}
      />

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
              Upcoming Grands Prix
            </h2>
            <Link to="/f1/races" className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-neon)]">
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

      {selected && (
        <div
          className="fixed inset-x-0 z-50 mx-auto max-w-2xl space-y-2 rounded-t-lg border border-[var(--color-neon)]/40 bg-[#050A08]/98 p-3.5 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] backdrop-blur"
          style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-neon)]">
                Championship · {selected.market_type}
              </div>
              <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--color-ink)]">
                {selected.label}{" "}
                <span className="font-display tabular-nums text-[var(--color-neon)]">
                  {odds.toFixed(2)}x
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Clear selection"
              className="shrink-0 rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
              className="flex-1 min-w-0 rounded-md border border-[var(--color-surface-border)] bg-black px-3 py-2.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)] outline-none focus:border-[var(--color-neon)]"
              placeholder={`Points (${MIN_STAKE}+)`}
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => placeMut.mutate()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-4 py-2.5 text-[12px] font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {placeMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : overBalance ? (
                "Over balance"
              ) : (
                <>
                  Lock <ArrowUpRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
            <span>
              Return{" "}
              <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
                {potentialReturn.toFixed(2)}
              </span>
            </span>
            <span>
              Bal{" "}
              <span className="font-bold tabular-nums text-[var(--color-ink)]">{balance.toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      <PageFooter />
    </div>
  );
}

function ChampionshipOutrights({
  loading,
  drivers,
  constructors,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  drivers: ChampMarket[];
  constructors: ChampMarket[];
  selectedId: string | null;
  onSelect: (m: ChampMarket) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
        Championship outrights
      </h2>
      {loading ? (
        <div className="grid h-20 place-items-center rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
        </div>
      ) : drivers.length === 0 && constructors.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          Championship markets open once standings odds are synced.
        </div>
      ) : (
        <div className="space-y-4">
          {drivers.length > 0 && (
            <ChampGroup title="Drivers' championship" markets={drivers} selectedId={selectedId} onSelect={onSelect} />
          )}
          {constructors.length > 0 && (
            <ChampGroup title="Constructors' championship" markets={constructors} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
      )}
    </section>
  );
}

function ChampGroup({
  title,
  markets,
  selectedId,
  onSelect,
}: {
  title: string;
  markets: ChampMarket[];
  selectedId: string | null;
  onSelect: (m: ChampMarket) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)]">
      <div className="border-b border-[var(--color-surface-border)] px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {title}
      </div>
      <div className="divide-y divide-[var(--color-surface-border)]">
        {markets.map((m) => {
          const active = m.id === selectedId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                active ? "bg-[var(--color-neon)]/10" : "hover:bg-white/[0.02]"
              }`}
            >
              <span className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{m.label}</span>
              <span
                className={`shrink-0 rounded-md border px-2.5 py-1 font-display text-[13px] font-bold tabular-nums ${
                  active
                    ? "border-[var(--color-neon)] bg-[var(--color-neon)] text-black"
                    : "border-[var(--color-neon)]/40 text-[var(--color-neon)]"
                }`}
              >
                {Number(m.odds).toFixed(2)}x
              </span>
            </button>
          );
        })}
      </div>
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
        <F1Badge size={28} />
        <CountryFlag country={race.country} w={22} h={14} />
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
              <div className="flex justify-center pb-0.5">
                <DriverPortrait url={d.photo} name={d.label} size={24} />
              </div>
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
          <span className={live ? "flex items-center gap-1.5 text-rose-400" : "flex items-center gap-1.5 text-[var(--color-ink-muted)]"}>
            {live ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            ) : (
              <F1Badge size={32} />
            )}
            {statusLabel(race.starts_at, race.status)}
          </span>
          <span className="text-[var(--color-ink-muted)]">Round {race.round}</span>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <CountryFlag country={race.country} w={44} h={28} />
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
