import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitPrediction } from "@/lib/predictions.functions";
import { refreshMatches, getMatchOddsHistory } from "@/lib/matches.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2 } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Matches — cssebets" }] }),
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
  group_name: string | null;
  reference_odds: { home: number; draw: number; away: number } | null;
  odds_updated_at: string | null;
  odds_source: string | null;
};

function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").trim();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function MatchesPage() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshMatches);

  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .or("is_simulation.is.null,is_simulation.eq.false")
        .order("kickoff_at", { ascending: true });
      if (error) throw error;
      return data as Match[];
    },
  });

  useEffect(() => {
    const run = () => refresh({}).catch(() => {});
    run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel("matches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        qc.invalidateQueries({ queryKey: ["matches"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { scheduled, completed } = useMemo(() => {
    const s: Match[] = [];
    const c: Match[] = [];
    for (const m of data ?? []) {
      if (m.status === "finished") c.push(m);
      else s.push(m);
    }
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { scheduled: s, completed: c };
  }, [data]);

  if (isLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;
  }

  if (!data?.length) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold">No matches yet</h2>
        <p className="text-sm text-muted-foreground mt-1">An admin needs to sync or add fixtures.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Matches</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Scheduled ({scheduled.length})
        </h2>
        {scheduled.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">No upcoming matches.</Card>
        ) : (
          scheduled.map((m) => <MatchCard key={m.id} match={m} />)
        )}
      </section>

      {completed.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>Completed matches ({completed.length})</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-3">
            {completed.map((m) => <MatchCard key={m.id} match={m} />)}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const submit = useServerFn(submitPrediction);
  const historyFn = useServerFn(getMatchOddsHistory);
  const qc = useQueryClient();
  const [stake, setStake] = useState("10");
  const [pick, setPick] = useState<"HOME" | "DRAW" | "AWAY" | null>(null);
  const [open, setOpen] = useState(false);

  const locked = new Date(match.kickoff_at).getTime() <= Date.now() || match.status !== "scheduled";
  const odds = match.reference_odds ?? { home: 2.0, draw: 3.2, away: 3.5 };

  const history = useQuery({
    queryKey: ["match-odds-history", match.id],
    queryFn: () => historyFn({ data: { matchId: match.id } }),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Pick an outcome");
      const ref = pick === "HOME" ? odds.home : pick === "DRAW" ? odds.draw : odds.away;
      return submit({
        data: {
          matchId: match.id, market: "result", outcome: pick,
          referenceOdds: Number(ref), virtualStake: Number(stake),
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Prediction submitted");
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      setPick(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stageLabel = [humanize(match.stage), humanize(match.group_name)]
    .filter(Boolean)
    .join(" · ") || "—";

  return (
    <Card className="p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left space-y-2"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{stageLabel}</div>
          <div className="text-xs text-muted-foreground">{new Date(match.kickoff_at).toLocaleString()}</div>
        </div>
        <div className="grid grid-cols-3 items-center text-lg font-semibold gap-3">
          <div className="flex justify-center"><TeamFlag name={match.home_team} /></div>
          <span className="text-muted-foreground text-sm text-center">
            {match.status === "finished" ? `${match.home_score} – ${match.away_score}` : "vs"}
          </span>
          <div className="flex justify-center"><TeamFlag name={match.away_team} /></div>
        </div>
      </button>

      {!locked && match.reference_odds && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(["HOME", "DRAW", "AWAY"] as const).map((p) => {
              const label = p === "HOME" ? match.home_team : p === "AWAY" ? match.away_team : "Draw";
              const price = p === "HOME" ? odds.home : p === "DRAW" ? odds.draw : odds.away;
              return (
                <Button
                  key={p} type="button" variant={pick === p ? "default" : "outline"}
                  onClick={() => setPick(p)} size="sm"
                  className="flex flex-col h-auto py-2"
                >
                  <span className="truncate max-w-full text-xs">{label}</span>
                  <span className="font-bold">{price}</span>
                </Button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input type="number" min={1} value={stake} onChange={(e) => setStake(e.target.value)} placeholder="Stake" />
            <Button disabled={!pick || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "..." : "Submit"}
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {match.odds_source === "the-odds-api"
              ? `Powered by cssebets · updated ${timeAgo(match.odds_updated_at)}`
              : "Reference odds (awaiting live market sync)"}
          </div>
        </div>
      )}

      {locked && (
        <div className="text-xs text-muted-foreground font-medium">
          {match.status === "finished" ? "Match finished." : "Betting closed — kickoff passed."}
        </div>
      )}

      {open && (
        <div className="pt-3 border-t space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Odds history
          </div>
          {history.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !history.data?.length ? (
            <div className="text-xs text-muted-foreground">No odds snapshots recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2 font-medium">When</th>
                    <th className="py-1 pr-2 font-medium truncate">{match.home_team}</th>
                    <th className="py-1 pr-2 font-medium">Draw</th>
                    <th className="py-1 pr-2 font-medium truncate">{match.away_team}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((r: any) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="py-1 pr-2 text-muted-foreground">{new Date(r.sampled_at).toLocaleString()}</td>
                      <td className="py-1 pr-2">{r.home_odds}</td>
                      <td className="py-1 pr-2">{r.draw_odds}</td>
                      <td className="py-1 pr-2">{r.away_odds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return <span className="text-sm font-semibold truncate">{name}</span>;
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-12 w-12 object-cover shadow-sm border border-border/40"
      loading="lazy"
    />
  );
}
