import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSupportOps } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/management/admin/support-ops")({
  head: () => ({ meta: [{ title: "Support Ops — Admin" }] }),
  component: SupportOpsPage,
});

function SupportOpsPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getSupportOps);
  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["support-ops", days],
    queryFn: () => withSession(() => fn({ data: { days } })),
    enabled: hasSession === true,
    staleTime: 30_000,
  });
  const d: any = q.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Support operations</h1>
          <p className="text-sm text-muted-foreground">Ticket volume, response/resolution timings, and per-staff activity over the selected window.</p>
        </div>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((n) => (
            <Button key={n} size="sm" variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>{n}d</Button>
          ))}
        </div>
      </div>

      {q.isLoading || !d ? (
        <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Open" value={d.tickets.open} />
            <Stat label="Unassigned" value={d.tickets.unassigned} tone={d.tickets.unassigned > 0 ? "warn" : undefined} />
            <Stat label="Assigned" value={d.tickets.assigned} />
            <Stat label={`Closed (${d.range_days}d)`} value={d.tickets.closed} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Avg first response</div>
              <div className="text-2xl font-bold tabular-nums">{d.timings.avg_first_response_min} min</div>
              <div className="text-[11px] text-muted-foreground">sample: {d.timings.sample_first_response} conversations</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Avg resolution time</div>
              <div className="text-2xl font-bold tabular-nums">{d.timings.avg_resolution_hr} h</div>
              <div className="text-[11px] text-muted-foreground">sample: {d.timings.sample_resolution} closed</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="font-semibold mb-2">Per-staff activity ({d.range_days}d)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Approvals</TableHead>
                  <TableHead className="text-right">Rejections</TableHead>
                  <TableHead className="text-right">Proof views</TableHead>
                  <TableHead className="text-right">Closed</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.per_staff.map((s: any) => (
                  <TableRow key={s.user_id}>
                    <TableCell className="text-sm">{s.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{s.role}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{s.tickets_assigned}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.approvals}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.rejections}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.proof_views}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.conversations_closed}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.messages_sent}</TableCell>
                  </TableRow>
                ))}
                {!d.per_staff.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No staff activity in range.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <Card className={`p-4 ${tone === "warn" ? "border-amber-500/50" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}
