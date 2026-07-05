import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBankrollOverview,
  listPlatformTransactions,
  adjustBankroll,
  listEligibleHouseUsers,
  setHouseUser,
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

export const Route = createFileRoute("/management/admin/bankroll")({
  component: BankrollPage,
});

const fmt = (n: number) => `RM${Math.round(n).toLocaleString()}`;

function BankrollPage() {
  const overviewFn = useServerFn(getBankrollOverview);
  const txnsFn = useServerFn(listPlatformTransactions);
  const adjustFn = useServerFn(adjustBankroll);
  const listHouseFn = useServerFn(listEligibleHouseUsers);
  const setHouseFn = useServerFn(setHouseUser);
  const qc = useQueryClient();

  // Gate queries on an active Supabase session — otherwise the bearer attacher has
  // nothing to send and requireSupabaseAuth rejects with "No authorization header".
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  const enabled = hasSession === true;

  const overview = useQuery({
    queryKey: ["bankroll-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 10_000,
    enabled,
  });
  const txns = useQuery({
    queryKey: ["platform-txns"],
    queryFn: () => txnsFn({ data: {} }),
    refetchInterval: 15_000,
    enabled,
  });
  const eligibles = useQuery({
    queryKey: ["bankroll-eligible-house"],
    queryFn: () => listHouseFn(),
    enabled,
  });

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [houseChoice, setHouseChoice] = useState("");
  const [houseReason, setHouseReason] = useState("");

  const houseMut = useMutation({
    mutationFn: () => setHouseFn({ data: { houseUserId: houseChoice, reason: houseReason } }),
    onSuccess: () => {
      toast.success("House user updated. Bankroll movements now mirror this wallet.");
      setHouseReason("");
      qc.invalidateQueries({ queryKey: ["bankroll-overview"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to set house user"),
  });


  const mut = useMutation({
    mutationFn: (action: "topup" | "withdraw") =>
      adjustFn({ data: { action, amount: Number(amount), reason } }),
    onSuccess: (res, action) => {
      toast.success(`${action === "topup" ? "Top up" : "Withdrawal"} applied. New balance ${fmt(res.newBalance)}`);
      setAmount("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["bankroll-overview"] });
      qc.invalidateQueries({ queryKey: ["platform-txns"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Adjustment failed"),
  });


  const o = overview.data;
  const platformBalance = o?.bankroll.platformBalance ?? 0;
  const globalExposure = o?.bankroll.globalExposure ?? 0;
  const availableBalance = o?.bankroll.availableBalance ?? 0;
  const safetyRatio = o?.bankroll.safetyRatio ?? null;
  const overexposed = availableBalance < 0;
  const lowCoverage = !overexposed && safetyRatio !== null && safetyRatio < 1.25;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" /> Bookmaker bankroll
        </h1>
        <p className="text-sm text-muted-foreground">
          Platform balance, global exposure, and safety coverage.
        </p>
      </div>

      {overview.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : o ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Platform balance" value={fmt(platformBalance)} />
            <Metric label="Global exposure" value={fmt(globalExposure)} />
            <Metric
              label="Available balance"
              value={fmt(availableBalance)}
              tone={overexposed ? "bad" : "good"}
            />
            <Metric
              label="Safety ratio"
              value={
                globalExposure === 0
                  ? "No exposure"
                  : `${Math.round((safetyRatio ?? 0) * 100)}%`
              }
              tone={overexposed ? "bad" : lowCoverage ? "bad" : "good"}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Pending match pools" value={fmt((o.bankroll as any).pendingMatchPools ?? 0)} />
            <Metric label="Total point issuance" value={fmt((o.bankroll as any).totalIssuance ?? 0)} />
            <Metric label="Total stakes collected" value={fmt(o.bankroll.totalStakes)} />
            <Metric label="Total payouts paid" value={fmt(o.bankroll.totalPayouts)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric
              label="Net platform P/L"
              value={fmt(o.bankroll.netPL)}
              tone={o.bankroll.netPL >= 0 ? "good" : "bad"}
              icon={o.bankroll.netPL >= 0 ? TrendingUp : TrendingDown}
            />
            <Metric
              label="House user"
              value={o.house ? o.house.displayName : "Not set"}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Open / Settled / Void bets: {o.bets.open} / {o.bets.settled} / {o.bets.void}
          </div>



          {overexposed && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              Warning: platform exposure exceeds available bankroll. New predictions may be rejected until
              exposure decreases or bankroll is topped up.
            </Card>
          )}
          {lowCoverage && (
            <Card className="p-3 border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              Caution: platform bankroll coverage is low compared to open exposure.
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
              <ShieldCheck className="h-4 w-4 text-primary" /> House user (bankroll owner)
            </div>
            <p className="text-xs text-muted-foreground">
              Metadata only — designates which admin is responsible for the platform bankroll. The user's own wallet
              is unaffected; the bankroll is tracked exclusively on the platform ledger. Super admin only.
            </p>
            <div className="text-sm">
              Current:{" "}
              <span className="font-medium">
                {o.house ? o.house.displayName : "Not set"}
              </span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Designate user</Label>
                <select
                  value={houseChoice}
                  onChange={(e) => setHouseChoice(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">— pick an admin —</option>
                  {(eligibles.data?.users ?? []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Reason (audit)</Label>
                <Textarea rows={2} value={houseReason} onChange={(e) => setHouseReason(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={() => houseMut.mutate()}
              disabled={houseMut.isPending || !houseChoice || houseReason.length < 3}
            >
              Set house user
            </Button>
          </Card>



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
