import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getBankrollOverview,
  listPlatformTransactions,
  adjustBankroll,
} from "@/lib/bankroll.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Wallet, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bankroll")({
  component: BankrollPage,
});

const fmt = (n: number) => `RM${Math.round(n).toLocaleString()}`;

function BankrollPage() {
  const overviewFn = useServerFn(getBankrollOverview);
  const txnsFn = useServerFn(listPlatformTransactions);
  const adjustFn = useServerFn(adjustBankroll);
  const qc = useQueryClient();

  const overview = useQuery({
    queryKey: ["bankroll-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 10_000,
  });
  const txns = useQuery({
    queryKey: ["platform-txns"],
    queryFn: () => txnsFn({ data: {} }),
    refetchInterval: 15_000,
  });

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: (action: "topup" | "withdraw") =>
      adjustFn({ data: { action, amount: Number(amount), reason } }),
    onSuccess: (res, action) => {
      toast.success(`${action === "topup" ? "Top up" : "Withdrawal"} applied. New balance ${fmt(res.newBalance)}`);
      setAmount("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["bankroll-overview"] });
      qc.invalidateQueries({ queryKey: ["platform-txns"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Adjustment failed"),
  });

  const o = overview.data;
  const bankrollHealthy = o ? o.bankroll.available >= 0 : true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" /> Bookmaker bankroll
        </h1>
        <p className="text-sm text-muted-foreground">
          Virtual house bank: collected stakes, paid payouts, current exposure.
        </p>
      </div>

      {overview.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : o ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Platform balance" value={fmt(o.bankroll.balance)} />
            <Metric label="Available bankroll" value={fmt(o.bankroll.available)} tone={bankrollHealthy ? "good" : "bad"} />
            <Metric label="Current exposure" value={fmt(o.bankroll.totalExposure)} />
            <Metric
              label="Net P/L"
              value={fmt(o.bankroll.netPL)}
              tone={o.bankroll.netPL >= 0 ? "good" : "bad"}
              icon={o.bankroll.netPL >= 0 ? TrendingUp : TrendingDown}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Total stakes collected" value={fmt(o.bankroll.totalStakes)} />
            <Metric label="Total payouts paid" value={fmt(o.bankroll.totalPayouts)} />
            <Metric label="Open bets" value={String(o.bets.open)} />
            <Metric label={`Settled / Void`} value={`${o.bets.settled} / ${o.bets.void}`} />
          </div>

          {!bankrollHealthy && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              Exposure exceeds available bankroll. New bets on the riskiest market will be rejected with
              "Maximum bookmaker exposure reached".
            </Card>
          )}

          {o.topLiabilityMatch && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Highest liability match</div>
              <div className="font-medium">{o.topLiabilityMatch.label}</div>
              <div className="text-sm text-muted-foreground">
                Worst-case payout: {fmt(o.topLiabilityMatch.worst)} on{" "}
                <span className="capitalize">{o.topLiabilityMatch.outcome}</span> ({fmt(o.topLiabilityMatch.outcomeValue)})
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Adjust bankroll
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Reason (audit)</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => mut.mutate("topup")}
                disabled={mut.isPending || !amount || reason.length < 3}
              >
                Top up bankroll
              </Button>
              <Button
                variant="outline"
                onClick={() => mut.mutate("withdraw")}
                disabled={mut.isPending || !amount || reason.length < 3}
              >
                Withdraw from bankroll
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-medium mb-2">Liabilities by match</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Match</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Home</TableHead>
                    <TableHead className="text-right">Draw</TableHead>
                    <TableHead className="text-right">Away</TableHead>
                    <TableHead className="text-right">Worst</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.matches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{m.status}</Badge></TableCell>
                      <TableCell className="text-right">{fmt(m.home)}</TableCell>
                      <TableCell className="text-right">{fmt(m.draw)}</TableCell>
                      <TableCell className="text-right">{fmt(m.away)}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{fmt(m.worst)}</TableCell>
                    </TableRow>
                  ))}
                  {!o.matches.length && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No open exposure.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-medium mb-2">Platform transaction ledger</div>
            {txns.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance after</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(txns.data?.transactions ?? []).map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(t.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{t.transaction_type}</TableCell>
                        <TableCell className="text-right">{fmt(Number(t.amount))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmt(Number(t.balance_after))}</TableCell>
                        <TableCell className="text-xs">{t.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!txns.data?.transactions?.length && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label, value, tone, icon: Icon,
}: { label: string; value: string; tone?: "good" | "bad"; icon?: any }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}
