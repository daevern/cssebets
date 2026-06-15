import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { syncFootballData, settleMatch } from "@/lib/admin.functions";
import { setMatchStatusManual, refreshMatchScore, listMatchesAdmin } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/matches")({
  component: AdminMatchesPage,
});

const STATUSES = ["scheduled", "live", "finished", "cancelled", "postponed"] as const;

function AdminMatchesPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const [reason, setReason] = useState("");
  const syncFn = useServerFn(syncFootballData);
  const settleFn = useServerFn(settleMatch);
  const statusFn = useServerFn(setMatchStatusManual);
  const refreshFn = useServerFn(refreshMatchScore);

  const matches = useQuery({
    queryKey: ["admin-matches-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, external_id, home_team, away_team, kickoff_at, status, home_score, away_score, home_score_ht, away_score_ht, stage, group_name, reference_odds, odds_updated_at, odds_source, is_simulation, winner, created_at, updated_at")
        .order("kickoff_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30_000,
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (r: any) => {
      if (r.warning) toast.warning(r.warning);
      else toast.success(`Synced ${r.upserted}/${r.total}`);
      qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { matchId: id } }),
    onSuccess: () => { toast.success("Refreshed"); qc.invalidateQueries({ queryKey: ["admin-matches-full"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: any }) =>
      statusFn({ data: { matchId: v.id, status: v.status, reason } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["admin-matches-full"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Matches</h1>
          <p className="text-sm text-muted-foreground">Sync fixtures, refresh scores, settle results.</p>
        </div>
        <Button variant="outline" disabled={isViewer || syncMut.isPending} onClick={() => syncMut.mutate()}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
          Sync football-data
        </Button>
      </div>

      <Card className="p-3">
        <label className="text-xs text-muted-foreground">Reason (required for status / settle changes)</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. API down, manual correction" />
      </Card>

      {matches.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          {(matches.data ?? []).map((m) => (
            <MatchRow
              key={m.id} match={m} reason={reason} canWrite={!isViewer}
              onRefresh={() => refreshMut.mutate(m.id)}
              onStatus={(s) => statusMut.mutate({ id: m.id, status: s })}
              onSettle={async (h, a) => {
                try {
                  await settleFn({ data: { matchId: m.id, homeScore: h, awayScore: a } });
                  toast.success("Settled");
                  qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
                } catch (e) { toast.error((e as Error).message); }
              }}
            />
          ))}
          {!matches.data?.length && (
            <Card className="p-4 text-center text-muted-foreground text-sm">No matches yet. Sync to load them.</Card>
          )}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match, reason, canWrite, onRefresh, onStatus, onSettle,
}: {
  match: any; reason: string; canWrite: boolean;
  onRefresh: () => void;
  onStatus: (s: typeof STATUSES[number]) => void;
  onSettle: (h: number, a: number) => void;
}) {
  const [h, setH] = useState(String(match.home_score ?? ""));
  const [a, setA] = useState(String(match.away_score ?? ""));

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium truncate">{match.home_team} vs {match.away_team}</div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="uppercase">{match.status}</Badge>
          <span className="text-muted-foreground">{new Date(match.kickoff_at).toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-14" value={h} onChange={(e) => setH(e.target.value)} placeholder="H" />
        <Input className="w-14" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" />
        <Button size="sm" disabled={!canWrite || h === "" || a === ""} onClick={() => onSettle(Number(h), Number(a))}>
          {match.status === "finished" ? "Re-settle" : "Settle"}
        </Button>
        <Button size="sm" variant="outline" disabled={!canWrite} onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
        <select
          className="h-9 rounded-md border bg-background px-2 text-xs"
          value={match.status}
          disabled={!canWrite || !reason}
          onChange={(e) => onStatus(e.target.value as any)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </Card>
  );
}
