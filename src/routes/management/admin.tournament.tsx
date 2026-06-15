import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  forceSyncTournamentOdds,
  settleTournamentWinner,
  setTournamentStatus,
} from "@/lib/tournament.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/tournament")({
  component: AdminTournamentPage,
});

function AdminTournamentPage() {
  const { isViewer } = useAuth();
  const qc = useQueryClient();
  const syncFn = useServerFn(forceSyncTournamentOdds);
  const settleFn = useServerFn(settleTournamentWinner);
  const statusFn = useServerFn(setTournamentStatus);
  const [winner, setWinner] = useState("");

  const t = useQuery({
    queryKey: ["admin-tournament"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("key,name,status,winner_team,locks_at,settled_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const tournamentKey = t.data?.key;

  const odds = useQuery({
    queryKey: ["admin-tournament-odds", tournamentKey],
    enabled: !!tournamentKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournament_outrights")
        .select("team,odds,updated_at,source")
        .eq("tournament_key", tournamentKey!)
        .order("odds", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const sync = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (r: any) => {
      toast.success(`Synced ${r.updated ?? 0} teams`);
      qc.invalidateQueries({ queryKey: ["admin-tournament-odds", tournamentKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settle = useMutation({
    mutationFn: () => settleFn({ data: { tournamentKey: tournamentKey!, winnerTeam: winner } }),
    onSuccess: (r: any) => {
      toast.success(`Settled ${r.settled} predictions`);
      qc.invalidateQueries({ queryKey: ["admin-tournament"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (status: "open" | "locked") =>
      statusFn({ data: { tournamentKey: tournamentKey!, status } }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin-tournament"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (t.isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (!t.data) return <Card className="p-4">No tournament found.</Card>;

  const canWrite = !isViewer;
  const status = t.data.status as "open" | "locked" | "settled";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t.data.name}</h1>
            <p className="text-xs text-muted-foreground">Manage outright odds & settlement.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="uppercase">
            {status}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={!canWrite || sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync odds
          </Button>
        </div>
      </div>

      {status !== "settled" && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">Betting:</span>
          <Button
            size="sm"
            variant={status === "open" ? "default" : "outline"}
            disabled={!canWrite || status === "open" || setStatus.isPending}
            onClick={() => setStatus.mutate("open")}
          >
            Open
          </Button>
          <Button
            size="sm"
            variant={status === "locked" ? "default" : "outline"}
            disabled={!canWrite || status === "locked" || setStatus.isPending}
            onClick={() => setStatus.mutate("locked")}
          >
            Lock
          </Button>
        </Card>
      )}

      {status !== "settled" ? (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-medium">Settle winner</div>
          <div className="flex gap-2">
            <Input
              placeholder="Winning team (must match odds list)"
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
            />
            <Button
              disabled={!canWrite || !winner || settle.isPending}
              onClick={() => settle.mutate()}
            >
              {settle.isPending ? "..." : "Settle"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Pays out matching predictions and credits winner wallets atomically.
          </div>
        </Card>
      ) : (
        <Card className="p-3 text-sm">
          🏆 Settled — winner:{" "}
          <span className="font-semibold">{t.data.winner_team}</span>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Outright odds ({odds.data?.length ?? 0})</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(odds.data ?? []).map((o) => (
            <Card key={o.team} className="p-3 flex items-center justify-between">
              <span className="font-medium truncate">{o.team}</span>
              <span className="tabular-nums font-semibold">{Number(o.odds).toFixed(2)}</span>
            </Card>
          ))}
          {!odds.data?.length && (
            <Card className="p-4 text-sm text-muted-foreground col-span-full">
              No odds yet. Click "Sync odds".
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
