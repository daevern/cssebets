import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyWallet,
  listMyTransactions,
  listMyRequests,
  createDraftPointRequest,
  attachProofToRequest,
  submitPointRequest,
  cancelDraftPointRequest,
} from "@/lib/wallet.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wallet as WalletIcon, Plus, Loader2, Upload, X, FileCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/wallet")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Wallet — cssebets" }] }),
  component: WalletPage,
});

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;
const PROOF_BUCKET = "point-request-proofs";

function WalletPage() {
  const wFn = useServerFn(getMyWallet);
  const tFn = useServerFn(listMyTransactions);
  const rFn = useServerFn(listMyRequests);
  const draftFn = useServerFn(createDraftPointRequest);
  const attachFn = useServerFn(attachProofToRequest);
  const submitFn = useServerFn(submitPointRequest);
  const cancelFn = useServerFn(cancelDraftPointRequest);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "point_requests", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-point-requests", uid] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, uid]);

  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File | null) {
    if (!file || !uid) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file type. Allowed: PDF, JPG, PNG, WEBP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File too large (max 10MB).");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid points amount first.");
      return;
    }
    setUploading(true);
    try {
      const { id }: any = await draftFn({ data: { amount: amt, reason: reason || null } });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `point-requests/${uid}/${id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from(PROOF_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);
      await attachFn({
        data: {
          requestId: id,
          filePath: path,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      });
      setDraftId(id);
      setProofName(file.name);
      toast.success("Proof uploaded.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeProof() {
    if (!draftId) return;
    try {
      await cancelFn({ data: { requestId: draftId } });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    setDraftId(null);
    setProofName(null);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error("Please upload proof before requesting points.");
      return submitFn({ data: { requestId: draftId, amount: Number(amount), reason: reason || null } });
    },
    onSuccess: () => {
      toast.success("Point request submitted for admin approval.");
      setAmount("100");
      setReason("");
      setDraftId(null);
      setProofName(null);
      qc.invalidateQueries({ queryKey: ["my-point-requests", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amountValid = Number(amount) > 0;
  const canSubmit = amountValid && !!draftId && !uploading;

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

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Request Points</h2>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Amount</label>
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" rows={2} />
        </div>

        <div className="rounded-md border bg-muted/40 p-3 space-y-1">
          <div className="text-sm font-semibold leading-tight">pointbank</div>
          <div className="text-sm font-mono tabular-nums leading-tight">154482323065</div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Upload proof file</label>
          <p className="text-xs text-muted-foreground">Accepted file types: PDF, JPG, JPEG, PNG, WEBP. Max 10MB.</p>

          {!draftId ? (
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                disabled={uploading || !amountValid}
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck className="h-4 w-4 text-green-500 shrink-0" />
                <span className="truncate">{proofName}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={removeProof}>
                <X className="h-4 w-4 mr-1" /> Remove file
              </Button>
            </div>
          )}
          {!amountValid && (
            <p className="text-xs text-muted-foreground">Enter a valid amount before uploading.</p>
          )}
        </div>

        <Button
          className="w-full"
          onClick={() => {
            if (!draftId) {
              toast.error("Please upload proof before requesting points.");
              return;
            }
            submit.mutate();
          }}
          disabled={!canSubmit || submit.isPending}
        >
          {submit.isPending ? "Submitting…" : (
            <><Upload className="h-4 w-4 mr-2" /> Request Points</>
          )}
        </Button>
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
                <div className="min-w-0">
                  <div className="font-medium">{Number(r.requested_amount).toLocaleString()} pts</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at ?? r.requested_at).toLocaleString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="text-xs text-destructive mt-1">Reason: {r.rejection_reason}</div>
                  )}
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
