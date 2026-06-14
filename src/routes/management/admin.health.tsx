import { createFileRoute } from "@tanstack/react-router";
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

  async function runNow() {
    try {
      const r = await runFn({});
      toast.success(`Overall: ${r.overall}`);
      qc.invalidateQueries({ queryKey: ["health-runs"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Health checks</h1>
          <p className="text-sm text-muted-foreground">Run on-demand or via the /api/public/hooks/health-check endpoint (no schedule set).</p>
        </div>
        <Button onClick={runNow}>Run checks now</Button>
      </div>

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
                <TableCell className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs font-mono">{r.check_name}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "ok" ? "outline" : r.status === "degraded" ? "secondary" : "destructive"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-xs tabular-nums">{r.duration_ms} ms</TableCell>
                <TableCell className="text-xs text-destructive">{r.error ?? ""}</TableCell>
              </TableRow>
            ))}
            {!q.data?.runs?.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No runs yet — click "Run checks now".</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
