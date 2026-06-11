import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminMetrics, getMatchExposure } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import {
  Users, ListChecks, Activity, Coins, TrendingUp, AlertCircle, Ban, Trophy,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const metricsFn = useServerFn(getAdminMetrics);
  const exposureFn = useServerFn(getMatchExposure);
  const m = useQuery({ queryKey: ["admin-metrics"], queryFn: () => metricsFn({}), refetchInterval: 30_000 });
  const ex = useQuery({ queryKey: ["admin-exposure"], queryFn: () => exposureFn({}), refetchInterval: 30_000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Live snapshot of the prediction pool.</p>
      </div>

      {m.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : m.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Users} label="Total users" value={m.data.totalUsers} />
          <Metric icon={Activity} label="Active (24h)" value={m.data.activeUsers} />
          <Metric icon={ListChecks} label="Predictions" value={m.data.totalPredictions} />
          <Metric icon={AlertCircle} label="Unsettled" value={m.data.unsettled} />
          <Metric icon={Coins} label="Virtual stake" value={m.data.totalStake.toLocaleString()} />
          <Metric icon={TrendingUp} label="Virtual payouts" value={m.data.totalPayouts.toLocaleString()} />
          <Metric
            icon={TrendingUp}
            label="Net movement"
            value={m.data.netMovement.toLocaleString()}
            valueClass={m.data.netMovement >= 0 ? "text-success" : "text-destructive"}
          />
          <Metric icon={Ban} label="Voided" value={m.data.voided} />
        </div>
      ) : null}

      {m.data && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" /> Top virtual winners
            </div>
            <ol className="text-sm space-y-1">
              {m.data.topWinners.map((u) => (
                <li key={u.id} className="flex justify-between border-b last:border-0 py-1">
                  <span className="truncate">{u.name}</span>
                  <span className="font-semibold tabular-nums">{u.points} pts</span>
                </li>
              ))}
              {!m.data.topWinners.length && <li className="text-muted-foreground">No data yet.</li>}
            </ol>
          </Card>
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-muted-foreground" /> Biggest virtual losers
            </div>
            <ol className="text-sm space-y-1">
              {m.data.topLosers.map((u) => (
                <li key={u.id} className="flex justify-between border-b last:border-0 py-1">
                  <span className="truncate">{u.name}</span>
                  <span className="tabular-nums">{u.points} pts</span>
                </li>
              ))}
              {!m.data.topLosers.length && <li className="text-muted-foreground">No data yet.</li>}
            </ol>
          </Card>
        </div>
      )}

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Match-by-match exposure</h2>
        {ex.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Kickoff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Preds</TableHead>
                  <TableHead className="text-right">Virtual stake</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ex.data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.match}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.kickoff_at).toLocaleString()}
                    </TableCell>
                    <TableCell><span className="text-xs uppercase">{r.status}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.stake.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!ex.data?.rows?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No matches yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, valueClass,
}: { icon: any; label: string; value: number | string; valueClass?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</div>
    </Card>
  );
}
