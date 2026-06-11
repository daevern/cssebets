import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitPrediction } from "@/lib/predictions.functions";
import { refreshMatches } from "@/lib/matches.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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

  // Trigger a live sync on mount + every 30s so finished matches reflect quickly.
  useEffect(() => {
    let cancelled = false;
    const run = () => refresh({}).catch(() => {});
    run();
    const id = setInterval(run, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refresh]);

  // Realtime: any matches row change → refetch.
  useEffect(() => {
    const channel = supabase
      .channel("matches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        qc.invalidateQueries({ queryKey: ["matches"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);


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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Matches</h1>
      <div className="space-y-3">
        {data.map((m) => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const submit = useServerFn(submitPrediction);
  const qc = useQueryClient();
  const [stake, setStake] = useState("10");
  const [pick, setPick] = useState<"HOME" | "DRAW" | "AWAY" | null>(null);

  const locked = new Date(match.kickoff_at).getTime() <= Date.now() || match.status !== "scheduled";

  const odds = match.reference_odds ?? { home: 2.0, draw: 3.2, away: 3.5 };

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

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {match.stage ?? "—"} {match.group_name ? `· ${match.group_name}` : ""}
        </div>
        <div className="text-xs text-muted-foreground">{new Date(match.kickoff_at).toLocaleString()}</div>
      </div>
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>{match.home_team}</span>
        <span className="text-muted-foreground text-sm">
          {match.status === "finished" ? `${match.home_score} – ${match.away_score}` : "vs"}
        </span>
        <span>{match.away_team}</span>
      </div>
      {!locked && match.reference_odds && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(["HOME", "DRAW", "AWAY"] as const).map((p) => (
              <Button
                key={p} type="button" variant={pick === p ? "default" : "outline"}
                onClick={() => setPick(p)} size="sm"
              >
                {p} ({p === "HOME" ? odds.home : p === "DRAW" ? odds.draw : odds.away})
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="number" min={1} value={stake} onChange={(e) => setStake(e.target.value)} placeholder="Stake" />
            <Button disabled={!pick || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "..." : "Submit"}
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {match.odds_source === "the-odds-api"
              ? `Live odds via The Odds API · updated ${timeAgo(match.odds_updated_at)}`
              : "Reference odds (awaiting live market sync)"}
          </div>
        </div>
      )}
      {locked && (
        <div className="text-xs text-muted-foreground font-medium">
          {match.status === "finished" ? "Match finished." : "Betting closed — kickoff passed."}
        </div>
      )}
    </Card>
  );
}
