import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettlementMonitor, retryFailedSettlement } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/settlements")({
  head: () => ({ meta: [{ title: "Settlements — Admin" }] }),
  component: SettlementsPage,
});

function SettlementsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(getSettlementMonitor);
  const retryFn = useServerFn(retryFailedSettlement);
  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["settlement-monitor"],
    queryFn: () => withSession(() => fn({})),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  async function retry(matchId: string) {
    try {
      const r = await retryFn({ data: { matchId } });
      toast.success(`Settled ${r.settled} predictions`);
      qc.invalidateQueries({ queryKey: ["settlement-monitor"] });
    } catch (e: any) { toast.error(e?.message ?? "Retry failed"); }
  }

  if (q.isLoading) return <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>;
  const d: any = q.data ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settlements</h1>
        <p className="text-sm text-muted-foreground">Monitor settlement status and retry failed matches.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-xl font-semibold">{d.pending}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Football {d.pendingBySport?.football ?? 0} · F1 {d.pendingBySport?.f1 ?? 0} · UFC {d.pendingBySport?.ufc ?? 0}
          </div>
        </Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Settled (24h)</div><div className="text-xl font-semibold">{d.completed24h}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Voided (24h)</div><div className="text-xl font-semibold">{d.voided24h}</div></Card>
        <Card className={`p-3 ${d.failedCount > 0 ? "border-destructive" : ""}`}>
          <div className="text-xs text-muted-foreground">Stuck</div>
          <div className="text-xl font-semibold">{d.failedCount}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{d.demoFailedCount ?? 0} from demo guests</div>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Last settle: {d.lastSettleAt ? new Date(d.lastSettleAt).toLocaleString() : "—"}
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Stuck settlements</h2>
        <p className="text-xs text-muted-foreground mb-2">
          Any football, F1 or UFC bet still unsettled while its match, race or fight is already finished.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sport</TableHead>
              <TableHead>Fixture</TableHead>
              <TableHead>Bet</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Age</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d.failedRows ?? []).map((r: any) => (
              <TableRow key={`${r.source}:${r.id}`}>
                <TableCell className="text-[11px] uppercase tracking-wide">
                  {r.sport}
                  {r.is_demo && <span className="ml-1 text-[9px] text-muted-foreground">(demo)</span>}
                </TableCell>
                <TableCell className="text-xs">{r.match}</TableCell>
                <TableCell className="text-[10px] font-mono">{r.id.slice(0, 8)}</TableCell>
                <TableCell className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-[11px] text-muted-foreground">{r.age_hours}h</TableCell>
                <TableCell>
                  {r.retryable ? (
                    <Button size="sm" variant="outline" onClick={() => retry(r.match_id)}>Retry</Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">auto (cron)</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!d.failedRows?.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No stuck settlements — every finished fixture is fully graded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
