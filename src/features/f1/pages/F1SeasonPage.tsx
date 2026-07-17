import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Flag, Trophy } from "lucide-react";
import { listF1Races, listF1ChampionshipMarkets } from "../f1.functions";

export function F1SeasonPage() {
  const listRaces = useServerFn(listF1Races);
  const listChamp = useServerFn(listF1ChampionshipMarkets);
  const season = new Date().getUTCFullYear();
  const [tab, setTab] = useState<"races" | "drivers" | "constructors">("races");

  const racesQ = useQuery({ queryKey: ["f1-races"], queryFn: () => listRaces(), refetchInterval: 60_000 });
  const champQ = useQuery({
    queryKey: ["f1-champ", season],
    queryFn: () => listChamp({ data: { season } }),
    refetchInterval: 120_000,
  });

  const upcoming = useMemo(
    () => (racesQ.data?.races ?? []).filter((r: any) => r.status !== "finished").slice(0, 12),
    [racesQ.data],
  );
  const past = useMemo(
    () => (racesQ.data?.races ?? []).filter((r: any) => r.status === "finished").slice(-5).reverse(),
    [racesQ.data],
  );

  const drivers = (champQ.data?.markets ?? []).filter((m: any) => m.market_type === "drivers").slice(0, 12);
  const teams = (champQ.data?.markets ?? []).filter((m: any) => m.market_type === "constructors").slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Flag className="h-4 w-4" /> Formula 1 · {season}
        </div>
        <h1 className="text-2xl font-bold">Grand Prix &amp; Championships</h1>
        <p className="text-sm text-muted-foreground">Race markets, podium and points finishes, and season-long outrights.</p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["races", "drivers", "constructors"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t === "races" ? "Race calendar" : t === "drivers" ? "Drivers' title" : "Constructors' title"}
          </Button>
        ))}
      </div>

      {tab === "races" && (
        <div className="space-y-3">
          {racesQ.isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
          {upcoming.length === 0 && !racesQ.isLoading && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No upcoming races yet. An admin needs to sync the season.
            </Card>
          )}
          {upcoming.map((r: any) => (
            <Link key={r.id} to="/f1/races/$raceId" params={{ raceId: r.id }} className="block">
              <Card className="flex items-center justify-between p-4 transition active:scale-[0.99]">
                <div>
                  <div className="text-xs text-muted-foreground">Round {r.round} · {r.country ?? "—"}</div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.circuit}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase text-muted-foreground">{r.status}</div>
                  <div className="text-sm font-mono">{new Date(r.starts_at).toLocaleString()}</div>
                </div>
              </Card>
            </Link>
          ))}
          {past.length > 0 && (
            <>
              <div className="pt-4 text-xs font-semibold uppercase text-muted-foreground">Recent</div>
              {past.map((r: any) => (
                <Card key={r.id} className="flex items-center justify-between p-3 opacity-75">
                  <div className="text-sm">{r.name}</div>
                  <div className="text-xs text-muted-foreground">Finished</div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab !== "races" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Trophy className="h-4 w-4" /> {tab === "drivers" ? "Drivers' Championship" : "Constructors' Championship"}
          </div>
          {champQ.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {(tab === "drivers" ? drivers : teams).map((m: any) => (
            <Card key={m.id} className="flex items-center justify-between p-3">
              <div className="font-medium">{m.label}</div>
              <div className="font-mono text-lg font-semibold">{Number(m.odds).toFixed(2)}</div>
            </Card>
          ))}
          {(tab === "drivers" ? drivers : teams).length === 0 && !champQ.isLoading && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No outright markets yet.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
