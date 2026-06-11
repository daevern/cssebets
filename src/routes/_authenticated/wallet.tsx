import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyWallet,
  listMyTransactions,
  listMyRequests,
  requestPoints,
} from "@/lib/wallet.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wallet as WalletIcon, Plus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/wallet")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Wallet — WC26 Pool" }] }),
  component: WalletPage,
});

function WalletPage() {
  const wFn = useServerFn(getMyWallet);
  const tFn = useServerFn(listMyTransactions);
  const rFn = useServerFn(listMyRequests);
  const reqFn = useServerFn(requestPoints);
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id;

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const txns = useQuery({
    queryKey: ["my-txns", uid],
    queryFn: () => tFn({ data: { limit: 50 } }),
    enabled: !!uid,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const reqs = useQuery({
    queryKey: ["my-point-requests", uid],
    queryFn: () => rFn({}),
    enabled: !!uid,
  });

  // Real-time: refresh wallet, txns, and predictions on any insert/update for THIS user.
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`wallet-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-txns", uid] });
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-predictions", uid] });
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: () => reqFn({ data: { amount: Number(amount), reason: reason || undefined } }),
    onSuccess: () => {
      toast.success("Point request submitted");
      setAmount("100"); setReason("");
      qc.invalidateQueries({ queryKey: ["my-point-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <WalletIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">My Wallet</h1>
      </div>

      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Current balance</div>
        <div className="mt-1 text-4xl font-bold tabular-nums">
          {wallet.isLoading ? "…" : (wallet.data?.balance ?? 0).toLocaleString()}
          <span className="text-base font-medium text-muted-foreground ml-2">pts</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Fantasy points only — no real money.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Request Points</h2>
        <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2">
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" rows={1} />
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !amount || Number(amount) <= 0}>
            {submit.isPending ? "…" : "Request"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">An admin will review your request.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">My point requests</h2>
        {reqs.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !reqs.data?.requests.length ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {reqs.data.requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                <div>
                  <div className="font-medium">{Number(r.requested_amount).toLocaleString()} pts</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.requested_at).toLocaleString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Transaction history</h2>
        {txns.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !txns.data?.transactions.length ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txns.data.transactions.map((t: any) => {
              const sign = t.type === "debit" ? "-" : "+";
              const color = t.type === "debit" ? "text-destructive" : "text-green-500";
              return (
                <div key={t.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-medium capitalize">{t.type} · {t.reference_type.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold tabular-nums ${color}`}>{sign}{Number(t.amount).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">bal {Number(t.balance_after).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="pt-2">
          <Link to="/matches" className="text-xs text-primary underline">Place a bet on Matches →</Link>
        </div>
      </Card>
    </div>
  );
}
