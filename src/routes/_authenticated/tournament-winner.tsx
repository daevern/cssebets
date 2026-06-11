import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { submitPrediction } from "@/lib/predictions.functions";
import { refreshTournamentOdds } from "@/lib/tournament.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tournament-winner")({
  head: () => ({ meta: [{ title: "Tournament Winner — cssebets" }] }),
  component: TournamentWinnerPage,
});

type Tournament = {
  key: string;
  name: string;
  status: "open" | "locked" | "settled";
  winner_team: string | null;
};

type Outright = { team: string; odds: number; updated_at: string };

function TournamentWinnerPage() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshTournamentOdds);
  const submit = useServerFn(submitPrediction);
  const [pick, setPick] = useState<string | null>(null);
  const [stake, setStake] = useState("10");

  const tournament = useQuery({
    queryKey: ["open-tournament"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("key,name,status,winner_team")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Tournament | null;
    },
  });

  const tournamentKey = tournament.data?.key;

  const odds = useQuery({
    queryKey: ["tournament-outrights", tournamentKey],
    enabled: !!tournamentKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournament_outrights")
        .select("team,odds,updated_at")
        .eq("tournament_key", tournamentKey!)
        .order("odds", { ascending: true });
      if (error) throw error;
      return data as Outright[];
    },
  });

  // Trigger throttled sync on mount, then refetch odds.
  useEffect(() => {
    refresh({})
      .then(() => qc.invalidateQueries({ queryKey: ["tournament-outrights"] }))
      .catch(() => {});
  }, [refresh, qc]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Pick a team");
      const row = (odds.data ?? []).find((o) => o.team === pick);
      if (!row) throw new Error("Selected team not available");
      return submit({
        data: {
          matchId: null,
          market: "tournament_winner",
          outcome: pick,
          referenceOdds: Number(row.odds),
          virtualStake: Number(stake),
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

  if (tournament.isLoading || odds.isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (!tournament.data) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold">No tournament configured</h2>
      </Card>
    );
  }

  const t = tournament.data;
  const locked = t.status !== "open";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t.name}</h1>
          <p className="text-xs text-muted-foreground">Bet on who wins the entire tournament.</p>
        </div>
        <Badge variant={locked ? "secondary" : "outline"} className="uppercase">
          {t.status}
        </Badge>
      </div>

      {t.status === "settled" && t.winner_team && (
        <Card className="p-4 text-sm">
          🏆 Winner: <span className="font-semibold">{t.winner_team}</span>
        </Card>
      )}

      {!odds.data?.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No outright odds available yet. Try again later.
        </Card>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {odds.data.map((o) => (
              <button
                key={o.team}
                type="button"
                disabled={locked}
                onClick={() => setPick(o.team)}
                className={`text-left rounded-md border p-3 transition ${
                  pick === o.team
                    ? "border-primary bg-primary/10"
                    : "hover:border-primary/60"
                } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{o.team}</span>
                  <span className="text-sm tabular-nums font-semibold">{o.odds}</span>
                </div>
              </button>
            ))}
          </div>

          {!locked && (
            <Card className="p-4 space-y-2 sticky bottom-20 md:bottom-4">
              <div className="text-sm">
                {pick ? (
                  <>
                    Picked: <span className="font-semibold">{pick}</span> @{" "}
                    {(odds.data.find((o) => o.team === pick)?.odds ?? 0).toFixed(2)}
                  </>
                ) : (
                  <span className="text-muted-foreground">Select a team above.</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  placeholder="Stake"
                />
                <Button disabled={!pick || mut.isPending} onClick={() => mut.mutate()}>
                  {mut.isPending ? "..." : "Submit"}
                </Button>
              </div>
              {pick && (
                <div className="text-xs text-muted-foreground">
                  Potential return:{" "}
                  {(
                    Number(stake || 0) *
                    (odds.data.find((o) => o.team === pick)?.odds ?? 0)
                  ).toFixed(2)}{" "}
                  pts
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
