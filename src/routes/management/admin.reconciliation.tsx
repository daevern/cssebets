import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runReconciliation } from "@/lib/reconciliation.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/management/admin/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation — Admin" }] }),
  component: ReconciliationPage,
});

function ReconciliationPage() {
  const fn = useServerFn(runReconciliation);
  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["admin-reconciliation"],
    queryFn: () => withSession(() => fn({})),
    enabled: hasSession === true,
    staleTime: 60_000,
  });

  const report: any = (q.data as any)?.report;
  const overall = report?.overall_status as "OK" | "DRIFT" | undefined;
  const driftCount = report?.drift_check_count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Compares wallets, bankroll, pools, payouts, point approvals and refunds against the
            underlying ledger.
          </p>
        </div>
        <Button onClick={() => q.refetch()} variant="outline" size="sm" disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      {q.isLoading ? (
        <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>
      ) : !report ? (
        <Card className="p-6 text-sm text-muted-foreground">No report yet.</Card>
      ) : (
        <>
          <Card className={`p-4 flex items-center gap-3 ${overall === "OK" ? "border-emerald-500/40" : "border-destructive/60"}`}>
            {overall === "OK" ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-destructive" />
            )}
            <div className="flex-1">
              <div className="font-semibold">
                {overall === "OK" ? "All checks OK" : `Drift detected in ${driftCount} check(s)`}
              </div>
              <div className="text-xs text-muted-foreground">
                Last checked: {report.checked_at ? new Date(report.checked_at).toLocaleString() : "—"}
              </div>
            </div>
          </Card>

          <div className="grid gap-3">
            {(report.checks ?? []).map((c: any) => (
              <CheckRow key={c.name} check={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: any }) {
  const ok = check.status === "OK";
  return (
    <Card className={`p-4 ${ok ? "" : "border-destructive/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-mono text-sm font-semibold">{check.name}</div>
          <div className={`text-xs ${ok ? "text-emerald-500" : "text-destructive"}`}>
            {check.status}
            {typeof check.affected === "number" && check.affected > 0 && ` · ${check.affected} affected`}
            {typeof check.diff === "number" && check.diff !== 0 && ` · diff ${check.diff}`}
            {typeof check.worst_diff === "number" && check.worst_diff > 0 && ` · worst ${check.worst_diff}`}
          </div>
          {check.note && <div className="text-[11px] text-muted-foreground italic">{check.note}</div>}
        </div>
      </div>
      {(check.samples?.length || check.real || check.won_total !== undefined) && (
        <pre className="mt-2 text-[10px] font-mono bg-muted rounded p-2 overflow-x-auto max-h-60">
{JSON.stringify({
  ...(check.real ? { real: check.real, simulation: check.simulation } : {}),
  ...(check.won_total !== undefined ? { won_total: check.won_total, credited_total: check.credited_total } : {}),
  ...(check.approved_total !== undefined ? { approved_total: check.approved_total, credited_total: check.credited_total } : {}),
  ...(check.void_stake_total !== undefined ? { void_stake_total: check.void_stake_total, refund_total: check.refund_total } : {}),
  ...(check.samples?.length ? { samples: check.samples } : {}),
}, null, 2)}
        </pre>
      )}
    </Card>
  );
}
