import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOperationsDashboard } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/management/admin/operations")({
  head: () => ({ meta: [{ title: "Operations — Admin" }] }),
  component: OperationsPage,
});

function StatusDot({ status }: { status: "ok" | "warning" | "critical" | string }) {
  const cls =
    status === "ok" ? "bg-emerald-500" :
    status === "warning" ? "bg-amber-500" : "bg-destructive";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function OperationsPage() {
  const fn = useServerFn(getOperationsDashboard);
  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["ops-dashboard"],
    queryFn: () => withSession(() => fn({})),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  if (q.isLoading) return <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>;
  const d: any = q.data ?? {};
  const h = d.health ?? {};
  const m = d.metrics ?? {};

  const healthRows: Array<[string, string]> = [
    ["Platform", h.platform], ["Betting", h.betting],
    ["Settlement", h.settlement], ["Odds sync", h.oddsSync],
    ["Support queue", h.support], ["Reconciliation", h.reconciliation],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Operations</h1>
        <p className="text-sm text-muted-foreground">Live system health and operational metrics.</p>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">System health</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {healthRows.map(([label, st]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <StatusDot status={st} />
              <span className="flex-1">{label}</span>
              <span className="text-xs text-muted-foreground capitalize">{st}</span>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Operational metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Registered users" value={m.registeredUsers ?? 0} />
          <Metric label="Active users (24h)" value={m.activeUsersDay ?? 0} />
          <Metric label="Bets today" value={m.betsDay ?? 0} />
          <Metric label="Bets this week" value={m.betsWeek ?? 0} />
          <Metric label="Stake volume (24h)" value={Number(m.stakeDay ?? 0).toFixed(2)} />
          <Metric label="Stake volume (week)" value={Number(m.stakeWeek ?? 0).toFixed(2)} />
          <Metric label="Pending point requests" value={m.pendingPoints ?? 0} />
          <Metric label="Pending payouts" value={m.pendingPayouts ?? 0} />
          <Metric label="Open support" value={m.openSupport ?? 0} />
          <Metric label="Failed settlements" value={m.failedSettlements ?? 0} />
          <Metric label="Rate-limit hits (24h)" value={m.rateLimitHits24h ?? 0} />
          <Metric label="Audit alerts (24h)" value={m.auditAlerts24h ?? 0} />
          <Metric label="Open incidents" value={m.openIncidents ?? 0} />
          <Metric label="Open alerts" value={m.openAlerts ?? 0} />
          <Metric label="Bankroll" value={Number(m.bankrollBalance ?? 0).toFixed(2)} />
          <Metric label="Last settle" value={m.lastSettleAt ? new Date(m.lastSettleAt).toLocaleString() : "—"} />
        </div>
      </div>
    </div>
  );
}
