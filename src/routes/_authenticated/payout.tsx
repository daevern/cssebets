import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyPayouts,
  getMySavedBankAccounts,
  addSavedBankAccount,
  deleteSavedBankAccount,
  userConfirmPayoutProof,
  userRejectPayoutProof,
  getPayoutProofSignedUrl,
} from "@/lib/payout.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Banknote, Loader2, Clock, Eye, CheckCircle2, XCircle, History, Plus, Trash2, Landmark, FileCheck2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";

function bankInitial(name: string) {
  const s = (name || "?").trim();
  return s.slice(0, 1).toUpperCase();
}

export const Route = createFileRoute("/_authenticated/payout")({
  ssr: false,
  head: () => ({ meta: [{ title: "Bank Accounts — cssebets" }] }),
  component: PayoutPage,
});

function PayoutPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const payFn = useServerFn(getMyPayouts);
  const banksFn = useServerFn(getMySavedBankAccounts);
  const addFn = useServerFn(addSavedBankAccount);
  const delFn = useServerFn(deleteSavedBankAccount);
  const confirmFn = useServerFn(userConfirmPayoutProof);
  const rejectFn = useServerFn(userRejectPayoutProof);
  const proofFn = useServerFn(getPayoutProofSignedUrl);

  const banks = useQuery({
    queryKey: ["my-saved-banks", uid],
    queryFn: () => banksFn({}),
    enabled: !!uid,
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

  const [addOpen, setAddOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accNo, setAccNo] = useState("");
  const [holder, setHolder] = useState("");
  const [proof, setProof] = useState<{ url: string; type: string; name: string } | null>(null);
  const [decision, setDecision] = useState<null | "approve" | "reject">(null);
  const [rejectReason, setRejectReason] = useState("");

  const active = payouts.data?.active ?? null;

  const addAcc = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          bankName: bankName.trim(),
          accountNumber: accNo.trim(),
          accountHolderName: holder.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Bank account saved.");
      setAddOpen(false);
      setBankName(""); setAccNo(""); setHolder("");
      qc.invalidateQueries({ queryKey: ["my-saved-banks", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAcc = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Bank account removed.");
      qc.invalidateQueries({ queryKey: ["my-saved-banks", uid] });
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

  const canAdd = bankName.trim().length >= 2 && accNo.trim().length >= 4 && !addAcc.isPending;
  const accounts = banks.data?.accounts ?? [];

  return (
    <PageShell kicker="Payout · Bank details" title="Manage your" titleAccent="bank accounts.">

      {/* Active banners (proof review still lives here) */}
      {active && active.status === "approved" && (
        <StencilPanel kicker={<><Clock className="h-3 w-3" /> Cashout in progress</>}>
          <div className="font-display text-lg font-bold">Pending cashout to bank</div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Your payout has been approved. The process will take 24 hours to 7 days.
            You will be asked to confirm once the bank-transfer proof is uploaded.
          </p>
        </StencilPanel>
      )}
      {active && active.status === "pending" && (
        <StencilPanel kicker={<><Clock className="h-3 w-3" /> Awaiting admin</>}>
          <div className="font-display text-lg font-bold">Payout request pending</div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            An admin will review your request shortly.
          </p>
        </StencilPanel>
      )}
      {active && active.status === "proof_uploaded" && (
        <StencilPanel kicker={<><Eye className="h-3 w-3" /> Action required · Review proof</>} accent>
          <div className="font-display text-lg font-bold">Proof of payment uploaded</div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Admin uploaded the bank-transfer proof. Please review and approve, or reject with a reason.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => viewProof(active.id)} className="border-[var(--color-surface-border)] bg-[#070D0A]">
              <Eye className="h-4 w-4 mr-1" /> View proof
            </Button>
            <button
              type="button"
              onClick={() => setDecision("approve")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-neon)] px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_20px_var(--color-neon-glow)] hover:brightness-110"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve
            </button>
            <Button variant="destructive" onClick={() => setDecision("reject")}>
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        </StencilPanel>
      )}

      {/* Saved bank accounts */}
      <StencilPanel kicker={<><Banknote className="h-3 w-3" /> Saved bank accounts</>}>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Add the bank accounts you want to cash out to. Saved accounts will appear in the Cash Out popup on your wallet.
        </p>

        <div className="mt-4 space-y-2">
          {banks.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-ink-muted)]" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-[var(--color-surface-border)] bg-[#050E0A] px-3 py-8 text-center">
              <Landmark className="h-6 w-6 text-[var(--color-neon)]/50" />
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                No accounts on file
              </div>
              <p className="text-xs text-[var(--color-ink-muted)]/80">
                Add one below to enable cashouts from your wallet.
              </p>
            </div>
          ) : (
            accounts.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-3 border border-[var(--color-surface-border)] bg-[#050E0A] px-3 py-3 transition-colors hover:border-[var(--color-neon)]/30"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--color-surface-border)] bg-[#020806] font-display text-sm font-bold text-[var(--color-neon)]">
                  {bankInitial(a.bankName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                    {a.bankName}
                  </div>
                  <div className="mt-0.5 font-mono text-sm tabular-nums text-[var(--color-ink)]">
                    {a.accountNumber}
                  </div>
                  {a.accountHolderName && (
                    <div className="text-[10px] text-[var(--color-ink-muted)]/80">
                      {a.accountHolderName}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm.isPending) return;
                    if (window.confirm(`Remove ${a.masked}?`)) removeAcc.mutate(a.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center border border-[var(--color-surface-border)] bg-transparent text-[var(--color-ink-muted)] transition-colors hover:border-destructive/50 hover:text-destructive"
                  aria-label="Remove account"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-none bg-[var(--color-neon)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.28em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> Add bank account
        </button>
      </StencilPanel>

      {/* History */}
      <StencilPanel kicker={<><History className="h-3 w-3" /> Payout history</>}>
        {payouts.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-[var(--color-ink-muted)]" />
        ) : !payouts.data?.payouts.length ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No payout requests yet.</p>
        ) : (
          <div className="space-y-2">
            {payouts.data.payouts.map((p: any) => (
              <div key={p.id} className="flex items-start justify-between gap-3 border border-[var(--color-surface-border)] bg-[#070D0A] p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-bold tabular-nums">
                    {Number(p.amount).toLocaleString()}{" "}
                    <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span> → {p.bank_name}
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-muted)]">
                    Acc {p.bank_account_number} · {new Date(p.created_at).toLocaleString()}
                  </div>
                  {p.status === "rejected_by_admin" && p.rejection_reason && (
                    <div className="text-[11px] text-destructive mt-1">Admin reason: {p.rejection_reason}</div>
                  )}
                  {p.status === "rejected_by_user" && p.user_rejection_reason && (
                    <div className="text-[11px] text-destructive mt-1">Your reason: {p.user_rejection_reason}</div>
                  )}
                </div>
                <Badge variant={
                  p.status === "completed" ? "default" :
                  p.status.startsWith("rejected") ? "destructive" : "secondary"
                } className="uppercase tracking-wider text-[10px]">
                  {p.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </StencilPanel>

      {/* Add bank dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-sm bg-[var(--surface-1,#0B1512)] border-[var(--color-surface-border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[var(--color-neon)]" />
              Add bank account
            </DialogTitle>
            <DialogDescription>
              Saved accounts appear in the Cash Out popup so you can withdraw quickly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Bank name</label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Maybank" className="bg-[#070D0A] border-[var(--color-surface-border)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Account number</label>
              <Input value={accNo} onChange={(e) => setAccNo(e.target.value)} placeholder="Account number" className="bg-[#070D0A] border-[var(--color-surface-border)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Account holder name (optional)</label>
              <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Name on the account" className="bg-[#070D0A] border-[var(--color-surface-border)]" />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addAcc.isPending}>Cancel</Button>
            <Button
              onClick={() => addAcc.mutate()}
              disabled={!canAdd}
              className="bg-[var(--color-neon)] text-black hover:brightness-110 disabled:opacity-40"
            >
              {addAcc.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : "Save account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </PageShell>
  );
}
