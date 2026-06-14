import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPlatformAnalytics } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/management/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Admin" }] }),
  component: AnalyticsPage,
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function AnalyticsPage() {
  const fn = useServerFn(getPlatformAnalytics);
  const hasSession = useHasSession();
  const [days, setDays] = useState(30);

  const q = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => withSession(() => fn({ data: { days } })),
    enabled: hasSession === true,
  });

  if (q.isLoading) return <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>;
  const d: any = q.data ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Platform analytics</h1>
          <p className="text-sm text-muted-foreground">Aggregated across {days} days.</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 14, 30, 60, 90, 180].map((n) => <SelectItem key={n} value={String(n)}>Last {n} days</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric label="Total users" value={d.users?.total ?? 0} />
          <Metric label="Active users" value={d.users?.active ?? 0} />
          <Metric label="New users" value={d.users?.new ?? 0} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Betting</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric label="Total bets" value={d.betting?.totalBets ?? 0} />
          <Metric label="Total stake" value={Number(d.betting?.totalStake ?? 0).toFixed(2)} />
          <Metric label="Avg stake" value={Number(d.betting?.avgStake ?? 0).toFixed(2)} />
        </div>
        <Card className="p-3 mt-3">
          <div className="text-xs text-muted-foreground mb-1">Top markets</div>
          <div className="space-y-1 text-xs">
            {(d.betting?.topMarkets ?? []).map(([m, c]: [string, number]) => (
              <div key={m} className="flex justify-between"><span>{m}</span><span className="tabular-nums">{c}</span></div>
            ))}
            {!d.betting?.topMarkets?.length && <span className="text-muted-foreground">—</span>}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Financial</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric label="Bankroll" value={Number(d.financial?.bankroll ?? 0).toFixed(2)} />
          <Metric label="Net P/L (period)" value={Number(d.financial?.netPL ?? 0).toFixed(2)} />
          <Metric label="Payout volume" value={Number(d.financial?.payoutVolume ?? 0).toFixed(2)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Support</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric label="Tickets opened" value={d.support?.ticketsOpened ?? 0} />
          <Metric label="Tickets closed" value={d.support?.ticketsClosed ?? 0} />
          <Metric label="Messages" value={d.support?.messages ?? 0} />
        </div>
      </div>
    </div>
  );
}
