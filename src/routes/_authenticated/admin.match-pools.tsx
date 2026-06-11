import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMatchPools } from "@/lib/bankroll.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/match-pools")({
  component: MatchPoolsPage,
});

const fmt = (n: number) => `RM${Math.round(n).toLocaleString()}`;

function MatchPoolsPage() {
  const fn = useServerFn(listMatchPools);
  const q = useQuery({
    queryKey: ["admin-match-pools"],
    queryFn: () => fn(),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" /> Match pools
        </h1>
        <p className="text-sm text-muted-foreground">
          Virtual points only — no real-money payments are processed. Stakes are held in the match pool
          and transferred to the bankroll on settlement.
        </p>
      </div>

      <Card className="p-4">
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total pool</TableHead>
                  <TableHead className="text-right">Home</TableHead>
                  <TableHead className="text-right">Draw</TableHead>
                  <TableHead className="text-right">Away</TableHead>
                  <TableHead className="text-right">Predictions</TableHead>
                  <TableHead className="text-right">Transferred</TableHead>
                  <TableHead className="text-right">Payouts</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.pools ?? []).map((p: any) => (
                  <TableRow key={p.matchId}>
                    <TableCell className="font-medium">
                      {p.label}
                      {p.score ? <span className="text-xs text-muted-foreground ml-2">{p.score}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {p.voided ? "voided" : p.settled ? "settled" : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.totalPool)}</TableCell>
                    <TableCell className="text-right">{fmt(p.homePool)}</TableCell>
                    <TableCell className="text-right">{fmt(p.drawPool)}</TableCell>
                    <TableCell className="text-right">{fmt(p.awayPool)}</TableCell>
                    <TableCell className="text-right">{p.predictionCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(p.transferredToBankroll)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(p.winnerPayoutTotal)}</TableCell>
                    <TableCell className={`text-right font-medium ${p.profitLoss >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmt(p.profitLoss)}
                    </TableCell>
                  </TableRow>
                ))}
                {!q.data?.pools.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      No match pools yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
