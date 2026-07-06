import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPredictionsAdmin, voidPredictionAdmin, regradePredictionAdmin } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Flag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/predictions")({
  component: AdminPredictionsPage,
});

const MARKETS = ["", "result", "correct_score", "total_goals", "btts", "first_scorer", "group_winner", "tournament_winner"];
const STATUSES = ["", "pending", "won", "lost", "void"];
const REGRADE_TARGETS = ["won", "lost", "void", "pending"] as const;

function AdminPredictionsPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const listFn = useServerFn(listPredictionsAdmin);
  const voidFn = useServerFn(voidPredictionAdmin);
  const regradeFn = useServerFn(regradePredictionAdmin);

  const q = useQuery({
    queryKey: ["admin-predictions", market, status],
    queryFn: () => listFn({ data: { market: market || undefined, status: status || undefined } }),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { predictionId: id, reason } }),
    onSuccess: () => { toast.success("Voided & refunded"); qc.invalidateQueries({ queryKey: ["admin-predictions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regradeMut = useMutation({
    mutationFn: (v: { id: string; newStatus: string }) =>
      regradeFn({ data: { predictionId: v.id, newStatus: v.newStatus as any, reason } }),
    onSuccess: (r: any) => {
      const delta = Number(r?.delta ?? 0);
      toast.success(`Regraded · wallet delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["admin-predictions"] });
    },
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
            placeholder="Reason (required to void / regrade)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="md:max-w-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Flagged only
          </label>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {((q.data?.predictions ?? []).filter((p: any) => !flaggedOnly || p.flagged_for_review).length).toLocaleString()} predictions.
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
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Regrade</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.predictions ?? []).filter((p: any) => !flaggedOnly || p.flagged_for_review).map((p: any) => {
                  const stake = Number(p.virtual_stake);
                  const odds = Number(p.reference_odds);
                  const payout = stake * odds;
                  const flagged = !!p.flagged_for_review;
                  return (
                  <TableRow key={p.id} className={flagged ? "bg-yellow-500/5" : undefined}>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {flagged && <Flag className="h-3 w-3 text-yellow-500 shrink-0" aria-label="Flagged" />}
                        {p.display_name}
                      </div>
                      {flagged && p.flagged_reason && (
                        <div className="text-[10px] text-yellow-600 mt-0.5 max-w-[200px]" title={p.flagged_reason}>
                          {p.flagged_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{p.match}</TableCell>
                    <TableCell className="text-xs">{p.market}</TableCell>
                    <TableCell className="text-xs">{p.outcome}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{stake.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{odds.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold text-primary tabular-nums">{payout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{p.status}</Badge></TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <select
                        className="h-7 rounded border bg-background px-1 text-[11px]"
                        disabled={isViewer || !reason || regradeMut.isPending}
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          if (v === p.status) { toast.error("Already that status"); e.currentTarget.value = ""; return; }
                          if (!window.confirm(`Regrade this bet ${p.status} → ${v}? Wallet will be adjusted atomically.`)) {
                            e.currentTarget.value = ""; return;
                          }
                          regradeMut.mutate({ id: p.id, newStatus: v });
                          e.currentTarget.value = "";
                        }}
                      >
                        <option value="">→ …</option>
                        {REGRADE_TARGETS.filter((t) => t !== p.status).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </TableCell>
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
                  );
                })}
                {!q.data?.predictions?.length && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No predictions.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

      </Card>
    </div>
  );
}
