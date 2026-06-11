import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyPayouts,
  createPayoutRequest,
  userConfirmPayoutProof,
  userRejectPayoutProof,
  getPayoutProofSignedUrl,
} from "@/lib/payout.functions";
import { getMyWallet } from "@/lib/wallet.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Banknote, Loader2, Clock, Eye, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payout")({
  ssr: false,
  head: () => ({ meta: [{ title: "Payout — cssebets" }] }),
  component: PayoutPage,
});

function PayoutPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const payFn = useServerFn(getMyPayouts);
  const wFn = useServerFn(getMyWallet);
  const createFn = useServerFn(createPayoutRequest);
  const confirmFn = useServerFn(userConfirmPayoutProof);
  const rejectFn = useServerFn(userRejectPayoutProof);
  const proofFn = useServerFn(getPayoutProofSignedUrl);

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const payouts = useQuery({
    queryKey: ["my-payouts", uid],
    queryFn: () => payFn({}),
    enabled: !!uid,
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`payouts-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payout_requests", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-payouts", uid] });
        qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  const [bankName, setBankName] = useState("");
  const [accNo, setAccNo] = useState("");
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<{ url: string; type: string; name: string } | null>(null);
  const [decision, setDecision] = useState<null | "approve" | "reject">(null);
  const [rejectReason, setRejectReason] = useState("");

  const active = payouts.data?.active ?? null;
  const balance = wallet.data?.balance ?? 0;

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { bankName: bankName.trim(), bankAccountNumber: accNo.trim(), amount: Number(amount) },
      }),
    onSuccess: () => {
      toast.success("Payout request submitted.");
      setBankName(""); setAccNo(""); setAmount("");
      qc.invalidateQueries({ queryKey: ["my-payouts", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmFn({ data: { payoutId: id } }),
    onSuccess: () => {
      toast.success("Payout confirmed.");
      setDecision(null); setProof(null);
      qc.invalidateQueries({ queryKey: ["my-payouts", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      rejectFn({ data: { payoutId: vars.id, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Payout rejected. Points refunded.");
      setDecision(null); setProof(null); setRejectReason("");
      qc.invalidateQueries({ queryKey: ["my-payouts", uid] });
      qc.invalidateQueries({ queryKey: ["my-wallet", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function viewProof(id: string) {
    try {
      const r: any = await proofFn({ data: { payoutId: id } });
      setProof(r);
    } catch (e) { toast.error((e as Error).message); }
  }

  const amt = Number(amount);
  const canRequest =
    !active &&
    bankName.trim().length >= 2 &&
    accNo.trim().length >= 4 &&
    amt > 0 &&
    amt <= balance;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Banknote className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Payout</h1>
      </div>

      <Card className="p-5">
        <div className="text-sm text-muted-foreground">Available balance</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">
          {wallet.isLoading ? "…" : balance.toLocaleString()}
          <span className="text-base font-medium text-muted-foreground ml-2">pts</span>
        </div>
      </Card>

      {/* Active payout banner */}
      {active && active.status === "approved" && (
        <Card className="p-5 border-amber-500/40 bg-amber-500/5 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <div className="font-semibold">Pending cashout to bank</div>
            <p className="text-sm text-muted-foreground">
              Your payout has been approved. The process will take 24 hours to 7 days.
              You will be asked to confirm once the bank-transfer proof is uploaded.
            </p>
          </div>
        </Card>
      )}
      {active && active.status === "pending" && (
        <Card className="p-5 border-muted bg-muted/30 flex items-start gap-3">
          <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <div className="font-semibold">Payout request pending</div>
            <p className="text-sm text-muted-foreground">
              An admin will review your request shortly. New payout requests are disabled until this one is resolved.
            </p>
          </div>
        </Card>
      )}

      {/* Awaiting user decision */}
      {active && active.status === "proof_uploaded" && (
        <Card className="p-5 space-y-3 border-primary/40 bg-primary/5">
          <div className="font-semibold">Proof of payment uploaded</div>
          <p className="text-sm text-muted-foreground">
            Admin uploaded the bank-transfer proof. Please review and approve, or reject with a reason.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => viewProof(active.id)}>
              <Eye className="h-4 w-4 mr-1" /> View proof
            </Button>
            <Button onClick={() => setDecision("approve")}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button variant="destructive" onClick={() => setDecision("reject")}>
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        </Card>
      )}

      {/* Request form */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Request a cashout</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Bank name</label>
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Maybank" disabled={!!active} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Bank account number</label>
          <Input value={accNo} onChange={(e) => setAccNo(e.target.value)} placeholder="Account number" disabled={!!active} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Points to withdraw</label>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" disabled={!!active} />
          {amt > balance && <p className="text-xs text-destructive">Amount exceeds your balance.</p>}
        </div>
        <Button className="w-full" disabled={!canRequest || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Submitting…" : "Request payout"}
        </Button>
        {active && (
          <p className="text-xs text-muted-foreground">
            You have an active payout request. New requests are disabled until it's resolved.
          </p>
        )}
      </Card>

      {/* History */}
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Payout history</h2>
        {payouts.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !payouts.data?.payouts.length ? (
          <p className="text-sm text-muted-foreground">No payout requests yet.</p>
        ) : (
          <div className="space-y-2">
            {payouts.data.payouts.map((p: any) => (
              <div key={p.id} className="border rounded-md p-3 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{Number(p.amount).toLocaleString()} pts → {p.bank_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Acc {p.bank_account_number} · {new Date(p.created_at).toLocaleString()}
                  </div>
                  {p.status === "rejected_by_admin" && p.rejection_reason && (
                    <div className="text-xs text-destructive mt-1">Admin reason: {p.rejection_reason}</div>
                  )}
                  {p.status === "rejected_by_user" && p.user_rejection_reason && (
                    <div className="text-xs text-destructive mt-1">Your reason: {p.user_rejection_reason}</div>
                  )}
                </div>
                <Badge variant={
                  p.status === "completed" ? "default" :
                  p.status.startsWith("rejected") ? "destructive" : "secondary"
                }>
                  {p.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Proof viewer */}
      <Dialog open={!!proof && !decision} onOpenChange={(o) => !o && setProof(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bank transfer proof</DialogTitle>
            <DialogDescription className="truncate">{proof?.name}</DialogDescription>
          </DialogHeader>
          {proof && (
            proof.type.startsWith("image/") ? (
              <img src={proof.url} alt={proof.name} className="max-h-[70vh] w-full object-contain rounded" />
            ) : proof.type === "application/pdf" ? (
              <iframe src={proof.url} title={proof.name} className="w-full h-[70vh] rounded border" />
            ) : (
              <a href={proof.url} target="_blank" rel="noreferrer" className="text-primary underline">Open file</a>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Approve confirm */}
      <Dialog open={decision === "approve"} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payout received</DialogTitle>
            <DialogDescription>
              By confirming, you acknowledge that the bank transfer has been received. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              disabled={!active || confirm.isPending}
              onClick={() => active && confirm.mutate(active.id)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject — non-dismissable until reason or cancel */}
      <Dialog
        open={decision === "reject"}
        onOpenChange={() => { /* prevent close via overlay/esc */ }}
      >
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reject proof of payment</DialogTitle>
            <DialogDescription>
              You must provide a reason to reject. Your points will be refunded.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why are you rejecting this proof?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecision(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 3 || reject.isPending || !active}
              onClick={() => active && reject.mutate({ id: active.id, reason: rejectReason.trim() })}
            >
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
