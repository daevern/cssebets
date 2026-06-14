import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAlerts, generateAlerts, acknowledgeAlert, resolveAlert } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/alerts")({
  head: () => ({ meta: [{ title: "Alerts — Admin" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAlerts);
  const genFn = useServerFn(generateAlerts);
  const ackFn = useServerFn(acknowledgeAlert);
  const resFn = useServerFn(resolveAlert);
  const hasSession = useHasSession();

  const q = useQuery({
    queryKey: ["alerts"],
    queryFn: () => withSession(() => listFn({})),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  async function evaluate() {
    try {
      const r = await genFn({});
      toast.success(`Evaluated ${r.evaluated} rule(s), ${r.created} new alert(s)`);
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function ack(id: string) {
    try { await ackFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["alerts"] }); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function resolve(id: string) {
    try { await resFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["alerts"] }); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold">Operational alerts</h1>
          <p className="text-sm text-muted-foreground">In-app alerts for drift, backlogs, and threshold breaches.</p>
        </div>
        <Button onClick={evaluate}>Evaluate now</Button>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.alerts ?? []).map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={a.level === "critical" ? "destructive" : a.level === "warning" ? "secondary" : "outline"}>{a.level}</Badge>
                </TableCell>
                <TableCell className="text-xs">{a.category}</TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium">{a.title}</div>
                  {a.message && <div className="text-muted-foreground">{a.message}</div>}
                </TableCell>
                <TableCell className="text-xs">{a.status}</TableCell>
                <TableCell className="space-x-1">
                  {a.status === "open" && <Button size="sm" variant="outline" onClick={() => ack(a.id)}>Ack</Button>}
                  {a.status !== "resolved" && <Button size="sm" onClick={() => resolve(a.id)}>Resolve</Button>}
                </TableCell>
              </TableRow>
            ))}
            {!q.data?.alerts?.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No alerts.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
