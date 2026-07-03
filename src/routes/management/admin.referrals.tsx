import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminGetReferralDashboard, adminAdjustReferral, adminFlagReferral } from "@/lib/referrals.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/referrals")({
  component: AdminReferralsPage,
});

function AdminReferralsPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const listFn = useServerFn(adminGetReferralDashboard);
  const adjustFn = useServerFn(adminAdjustReferral);
  const flagFn = useServerFn(adminFlagReferral);
  const q = useQuery({ queryKey: ["admin-referrals"], queryFn: () => listFn() });

  const [reason, setReason] = useState("");
  const [delta, setDelta] = useState("");

  const adjust = useMutation({
    mutationFn: (id: string) => adjustFn({ data: { referralId: id, tokensDelta: parseInt(delta || "0", 10), reason } }),
    onSuccess: () => { toast.success("Adjusted"); qc.invalidateQueries({ queryKey: ["admin-referrals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const flag = useMutation({
    mutationFn: ({ id, flagged }: { id: string; flagged: boolean }) =>
      flagFn({ data: { referralId: id, flagged, reason } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-referrals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Referrals</h1>
        <p className="text-sm text-muted-foreground">Track referrals and manage token rewards.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Total", q.data?.stats.total ?? 0],
          ["Active", q.data?.stats.active ?? 0],
          ["Flagged", q.data?.stats.flagged ?? 0],
          ["Tokens Awarded", q.data?.stats.tokensAwarded ?? 0],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{k as string}</div>
            <div className="font-mono text-2xl font-bold">{(v as number).toLocaleString()}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Top Referrers</div>
        <div className="space-y-1">
          {(q.data?.leaderboard ?? []).map((l, i) => (
            <div key={l.userId} className="flex justify-between text-sm">
              <div>{i + 1}. {l.name}</div>
              <div className="font-mono text-[var(--neon)]">{l.tokens.toLocaleString()} CSSE · {l.count} invites</div>
            </div>
          ))}
          {!q.data?.leaderboard?.length && <div className="text-xs text-muted-foreground">No referrals yet.</div>}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input placeholder="Token delta (±)" value={delta} onChange={(e) => setDelta(e.target.value)}
                 className="md:max-w-[160px]" type="number" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referrer</TableHead>
                <TableHead>Referred</TableHead>
                <TableHead className="text-right">Wagered</TableHead>
                <TableHead>Stages</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.referrer_name}</TableCell>
                  <TableCell className="text-xs">{r.referred_name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{Number(r.cumulative_settled_wagered).toLocaleString()}</TableCell>
                  <TableCell className="text-[10px]">
                    {r.stage1_completed ? "1✓" : "1·"}{" "}
                    {r.stage2_completed ? "2✓" : "2·"}{" "}
                    {r.stage3_completed ? "3✓" : "3·"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{Number(r.total_tokens_awarded).toLocaleString()}</TableCell>
                  <TableCell>
                    {r.flagged
                      ? <Badge variant="destructive" className="text-[10px]">Flagged</Badge>
                      : <Badge variant="outline" className="text-[10px]">OK</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" disabled={isViewer || !reason || !delta || adjust.isPending}
                            onClick={() => adjust.mutate(r.id)}>Adjust</Button>
                    <Button size="sm" variant="outline" disabled={isViewer || !reason || flag.isPending}
                            onClick={() => flag.mutate({ id: r.id, flagged: !r.flagged })}>
                      {r.flagged ? "Unflag" : "Flag"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!q.data?.rows?.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No referrals.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
