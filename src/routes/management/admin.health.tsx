import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHealthRuns, runHealthChecksNow } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/health")({
  head: () => ({ meta: [{ title: "Health — Admin" }] }),
  component: HealthPage,
});

const CADENCE: Record<string, string> = {
  database: "on demand",
  settlement_queue: "on demand",
  odds_sync: "≈5–15m",
  football_sync: "≈15–60m",
  football_settle: "≈2–10m when finished",
  f1_sync: "≈30–180m",
  health_cron_heartbeat: "≈5m cron",
  reconciliation: "on demand",
  support_service: "on demand",
  point_requests: "on demand",
  payout_requests: "on demand",
};

function HealthPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listHealthRuns);
  const runFn = useServerFn(runHealthChecksNow);
  const hasSession = useHasSession();

  const q = useQuery({
    queryKey: ["health-runs"],
    queryFn: () => withSession(() => listFn({})),
    enabled: hasSession === true,
    refetchInterval: 60_000,
  });

  const latestByCheck = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of q.data?.runs ?? []) {
      if (!map.has(r.check_name)) map.set(r.check_name, r);
    }
    return map;
  }, [q.data?.runs]);

  async function runNow() {
    try {
      const r = await runFn({});
      toast.success(`Overall: ${r.overall}`);
      qc.invalidateQueries({ queryKey: ["health-runs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Health checks</h1>
          <p className="text-sm text-muted-foreground">
            Cron cadence: POST{" "}
            <code className="text-[11px]">/api/public/hooks/health-check</code> about every 5
            minutes with <code className="text-[11px]">x-cron-secret</code>. Run on-demand below.
          </p>
        </div>
        <Button onClick={runNow}>Run checks now</Button>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Cron freshness</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "football_sync",
            "football_settle",
            "f1_sync",
            "odds_sync",
            "health_cron_heartbeat",
            "settlement_queue",
          ].map((name) => {
            const row = latestByCheck.get(name);
            const age = row?.metadata?.age_minutes ?? row?.metadata?.age_hours;
            const ageLabel =
              age == null
                ? "—"
                : typeof row?.metadata?.age_hours === "number"
                  ? `${Number(row.metadata.age_hours).toFixed(1)}h`
                  : `${Number(age).toFixed(0)}m`;
            return (
              <div
                key={name}
                className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{name}</span>
                  <Badge
                    variant={
                      !row
                        ? "secondary"
                        : row.status === "ok"
                          ? "outline"
                          : row.status === "degraded"
                            ? "secondary"
                            : "destructive"
                    }
                  >
                    {row?.status ?? "none"}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Age {ageLabel} · expect {CADENCE[name] ?? "varies"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Check</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.runs ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs font-mono">{r.check_name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === "ok" ? "outline" : r.status === "degraded" ? "secondary" : "destructive"
                    }
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs tabular-nums">{r.duration_ms} ms</TableCell>
                <TableCell className="text-xs text-destructive">{r.error ?? ""}</TableCell>
              </TableRow>
            ))}
            {!q.data?.runs?.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No runs yet — click &quot;Run checks now&quot;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
