import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Flag, Calendar, TrendingUp } from "lucide-react";
import { listF1Races, listF1ChampionshipMarkets, getF1Race } from "../f1.functions";

const COUNTRY_FLAG: Record<string, string> = {
  Bahrain: "🇧🇭", "Saudi Arabia": "🇸🇦", Australia: "🇦🇺", Japan: "🇯🇵", China: "🇨🇳",
  USA: "🇺🇸", "United States": "🇺🇸", Miami: "🇺🇸", "Emilia Romagna": "🇮🇹", Italy: "🇮🇹",
  Monaco: "🇲🇨", Canada: "🇨🇦", Spain: "🇪🇸", Austria: "🇦🇹", "Great Britain": "🇬🇧",
  UK: "🇬🇧", "United Kingdom": "🇬🇧", Hungary: "🇭🇺", Belgium: "🇧🇪", Netherlands: "🇳🇱",
  Azerbaijan: "🇦🇿", Singapore: "🇸🇬", Mexico: "🇲🇽", Brazil: "🇧🇷", "Abu Dhabi": "🇦🇪",
  Qatar: "🇶🇦", "Las Vegas": "🇺🇸", France: "🇫🇷", Germany: "🇩🇪", Portugal: "🇵🇹",
  Turkey: "🇹🇷", Russia: "🇷🇺",
};

function flagFor(country?: string | null) {
  if (!country) return "🏁";
  return COUNTRY_FLAG[country] ?? "🏁";
}

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.round(ms / (24 * 3600_000));
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `in ${d}d`;
}

function TopContenders({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const q = useQuery({
    queryKey: ["f1-race-preview", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    staleTime: 60_000,
  });
  const top = useMemo(() => {
    const winners = (q.data?.markets ?? []).filter((m: any) => m.market_type === "race_winner");
    const invSum = winners.reduce((s: number, m: any) => s + 1 / Number(m.odds), 0) || 1;
    return winners
      .map((m: any) => ({ label: m.label, pct: (1 / Number(m.odds)) / invSum * 100 }))
      .sort((a: any, b: any) => b.pct - a.pct)
      .slice(0, 3);
  }, [q.data]);

  if (q.isLoading || top.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {top.map((t: any) => (
        <div key={t.label} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          <span className="text-muted-foreground">{t.label.split(" ").slice(-1)[0]}</span>{" "}
          <span className="font-mono font-semibold text-foreground">{Math.round(t.pct)}%</span>
        </div>
      ))}
    </div>
  );
}

export function F1SeasonPage() {
  const listRaces = useServerFn(listF1Races);
  const listChamp = useServerFn(listF1ChampionshipMarkets);
  const season = new Date().getUTCFullYear();
  const [tab, setTab] = useState<"upcoming" | "past" | "outrights">("upcoming");

  const racesQ = useQuery({ queryKey: ["f1-races"], queryFn: () => listRaces(), refetchInterval: 60_000 });
  const champQ = useQuery({
    queryKey: ["f1-champ", season],
    queryFn: () => listChamp({ data: { season } }),
    refetchInterval: 120_000,
    enabled: tab === "outrights",
  });

  const upcoming = useMemo(
    () =>
      (racesQ.data?.races ?? [])
        .filter((r: any) => r.status !== "finished")
        .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [racesQ.data],
  );
  const past = useMemo(
    () =>
      (racesQ.data?.races ?? [])
        .filter((r: any) => r.status === "finished")
        .sort((a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [racesQ.data],
  );

  const nextRace = upcoming[0];
  const drivers = (champQ.data?.markets ?? []).filter((m: any) => m.market_type === "drivers");
  const teams = (champQ.data?.markets ?? []).filter((m: any) => m.market_type === "constructors");

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Flag className="h-4 w-4" /> Formula 1 · {season}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Race-by-race markets</h1>
        <p className="text-sm text-muted-foreground">
          Predict every Grand Prix. Odds move with the paddock — trade in and out until lights out.
        </p>
      </header>

      {nextRace && tab === "upcoming" && (
        <Link to="/f1/races/$raceId" params={{ raceId: nextRace.id }} className="block">
          <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-5 transition active:scale-[0.99]">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <TrendingUp className="h-3.5 w-3.5" /> Next up
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl leading-none">{flagFor(nextRace.country)}</span>
                  <div>
                    <div className="text-lg font-bold leading-tight">{nextRace.name}</div>
                    <div className="text-xs text-muted-foreground">{nextRace.circuit}</div>
                  </div>
                </div>
                <TopContenders raceId={nextRace.id} />
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-muted-foreground">{daysUntil(nextRace.starts_at)}</div>
                <div className="text-xs font-mono">
                  {new Date(nextRace.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </div>
            </div>
          </Card>
        </Link>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["upcoming", "Upcoming"],
            ["past", "Results"],
            ["outrights", "Championship"],
          ] as const
        ).map(([k, label]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
            {label}
          </Button>
        ))}
      </div>

      {tab === "upcoming" && (
        <div className="space-y-3">
          {racesQ.isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
          {upcoming.length === 0 && !racesQ.isLoading && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No upcoming Grands Prix yet. An admin needs to sync the season.
            </Card>
          )}
          {upcoming.slice(1).map((r: any) => (
            <Link key={r.id} to="/f1/races/$raceId" params={{ raceId: r.id }} className="block">
              <Card className="flex items-center gap-3 p-4 transition active:scale-[0.99] hover:border-primary/40">
                <div className="text-3xl leading-none">{flagFor(r.country)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Round {r.round}
                  </div>
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.circuit}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-primary">{daysUntil(r.starts_at)}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {new Date(r.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {tab === "past" && (
        <div className="space-y-2">
          {past.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No completed races yet.</Card>
          )}
          {past.map((r: any) => (
            <Card key={r.id} className="flex items-center gap-3 p-3 opacity-90">
              <div className="text-2xl leading-none">{flagFor(r.country)}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Settled
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "outrights" && (
        <div className="space-y-4">
          {champQ.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {drivers.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Drivers' Championship</div>
              <div className="space-y-1.5">
                {drivers.slice(0, 12).map((m: any) => (
                  <Card key={m.id} className="flex items-center justify-between p-3">
                    <div className="font-medium">{m.label}</div>
                    <div className="font-mono text-base font-semibold">{Number(m.odds).toFixed(2)}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {teams.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Constructors' Championship</div>
              <div className="space-y-1.5">
                {teams.slice(0, 10).map((m: any) => (
                  <Card key={m.id} className="flex items-center justify-between p-3">
                    <div className="font-medium">{m.label}</div>
                    <div className="font-mono text-base font-semibold">{Number(m.odds).toFixed(2)}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {!champQ.isLoading && drivers.length === 0 && teams.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No outright markets yet.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
