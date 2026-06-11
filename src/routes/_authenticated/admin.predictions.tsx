import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPredictionsAdmin, voidPredictionAdmin } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/predictions")({
  component: AdminPredictionsPage,
});

const MARKETS = ["", "result", "correct_score", "total_goals", "btts", "first_scorer", "group_winner", "tournament_winner"];
const STATUSES = ["", "pending", "won", "lost", "void"];

function AdminPredictionsPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const listFn = useServerFn(listPredictionsAdmin);
  const voidFn = useServerFn(voidPredictionAdmin);

  const q = useQuery({
    queryKey: ["admin-predictions", market, status],
    queryFn: () => listFn({ data: { market: market || undefined, status: status || undefined } }),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { predictionId: id, reason } }),
    onSuccess: () => { toast.success("Voided & refunded"); qc.invalidateQueries({ queryKey: ["admin-predictions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Predictions</h1>
        <p className="text-sm text-muted-foreground">View, filter, and void predictions.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {MARKETS.map((m) => <option key={m} value={m}>{m || "All markets"}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
          </select>
          <Input
            placeholder="Reason (required to void)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="md:max-w-sm"
          />
        </div>
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Stake</TableHead>
                  <TableHead className="text-right">Odds</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.predictions ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-sm">{p.display_name}</TableCell>
                    <TableCell className="text-xs">{p.match}</TableCell>
                    <TableCell className="text-xs">{p.market}</TableCell>
                    <TableCell className="text-xs">{p.outcome}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{Number(p.virtual_stake).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{Number(p.reference_odds).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{p.status}</Badge></TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline"
                        disabled={isViewer || p.status !== "pending" || !reason || voidMut.isPending}
                        onClick={() => voidMut.mutate(p.id)}
                      >
                        Void
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!q.data?.predictions?.length && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No predictions.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
