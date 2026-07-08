import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyWallet,
  listMyRequests,
  createDraftPointRequest,
  attachProofToRequest,
  submitPointRequest,
  cancelDraftPointRequest,
} from "@/lib/wallet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Loader2, Upload, X, FileCheck, Copy, Check, Building2, Receipt, ArrowLeft,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";

export const Route = createFileRoute("/_authenticated/wallet/top-up")({
  ssr: false,
  head: () => ({ meta: [{ title: "Top up · Request points — cssebets" }] }),
  component: TopUpPage,
});

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;
const PROOF_BUCKET = "point-request-proofs";

function TopUpPage() {
  const wFn = useServerFn(getMyWallet);
  const rFn = useServerFn(listMyRequests);
  const draftFn = useServerFn(createDraftPointRequest);
  const attachFn = useServerFn(attachProofToRequest);
  const submitFn = useServerFn(submitPointRequest);
  const cancelFn = useServerFn(cancelDraftPointRequest);
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id;

  const wallet = useQuery({ queryKey: ["my-wallet", uid], queryFn: () => wFn({}), enabled: !!uid });
  const myProfile = useQuery({
    queryKey: ["my-profile-ref", uid],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("public_reference").eq("id", uid!).maybeSingle();
      return (data as any)?.public_reference ?? null;
    },
    enabled: !!uid,
    staleTime: 60_000,
  });
  const reqs = useQuery({ queryKey: ["my-point-requests", uid], queryFn: () => rFn({}), enabled: !!uid });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`wallet-topup-${uid}`)
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
    if (!ACCEPTED.includes(file.type)) { toast.error("Unsupported file type. Allowed: PDF, JPG, PNG, WEBP."); return; }
    if (file.size > MAX_SIZE) { toast.error("File too large (max 10MB)."); return; }
    const amt = Number(amount);
    if (!amt || amt < 50) { toast.error("Enter a points amount of at least 50 first."); return; }
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
      await attachFn({ data: { requestId: id, filePath: path, fileName: file.name, fileType: file.type, fileSize: file.size } });
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
    try { await cancelFn({ data: { requestId: draftId } }); }
    catch (e) { toast.error((e as Error).message); return; }
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
      setAmount("100"); setReason(""); setDraftId(null); setProofName(null);
      qc.invalidateQueries({ queryKey: ["my-point-requests", uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amountValid = Number(amount) >= 50;
  const canSubmit = amountValid && !!draftId && !uploading;

  return (
    <PageShell kicker="Wallet" title="Top up" titleAccent="Request points">
      <div>
        <Link to="/wallet" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]">
          <ArrowLeft className="h-3 w-3" /> Back to wallet
        </Link>
      </div>

      <StencilPanel kicker={<><Plus className="h-3 w-3" /> Top up · Request points</>}>
        <div className="mt-4 space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Amount</label>
          <Input
            type="number" min={50} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="bg-[#070D0A] border-[var(--color-surface-border)]"
          />
          {amount !== "" && Number(amount) < 50 && (
            <p className="text-xs text-destructive">Minimum request amount is 50 pts.</p>
          )}
        </div>

        <div className="mt-4 border border-dashed border-[var(--color-surface-border)] bg-[#070D0A] p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
            <Building2 className="h-3 w-3" /> Bank transfer details
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold leading-tight">CIMB</div>
            <div className="text-xs leading-tight text-[var(--color-ink-muted)]">BRICKSPLUG ENTERPRISE SD BHD</div>
            <CopiableValue value="8010575969" label="Account number" />
          </div>
          <div className="border-t border-dashed border-[var(--color-surface-border)] pt-2 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">Reference ID</div>
            <ReferenceIdRow reference={myProfile.data ?? wallet.data?.publicReference ?? ""} />
            <p className="text-[11px] text-[var(--color-ink-muted)] leading-snug">
              Include this Reference ID with your transfer proof so admins can match your request.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Upload proof file</label>
          <p className="text-[11px] text-[var(--color-ink-muted)]">Accepted: PDF, JPG, JPEG, PNG, WEBP. Max 10MB.</p>
          {!draftId ? (
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef} type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                disabled={uploading || !amountValid}
                className="bg-[#070D0A] border-[var(--color-surface-border)]"
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />}
            </div>
          ) : (
            <div className="flex items-center justify-between border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/5 p-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck className="h-4 w-4 text-[var(--color-neon)] shrink-0" />
                <span className="truncate">{proofName}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={removeProof}>
                <X className="h-4 w-4 mr-1" /> Remove
              </Button>
            </div>
          )}
          {!amountValid && <p className="text-xs text-destructive font-medium">Enter at least 50 pts before uploading.</p>}
        </div>

        <button
          type="button"
          onClick={() => { if (!draftId) { toast.error("Please upload proof before requesting points."); return; } submit.mutate(); }}
          disabled={!canSubmit || submit.isPending}
          className="group mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-neon)] px-5 py-3.5 text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
        >
          {submit.isPending ? <>Submitting…</> : (<><Upload className="h-4 w-4" /><span>Request Points</span></>)}
        </button>
        <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">An admin will review your request.</p>
      </StencilPanel>

      <StencilPanel kicker={<><Receipt className="h-3 w-3" /> My point requests</>}>
        {reqs.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-[var(--color-ink-muted)]" />
        ) : !reqs.data?.requests.length ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {reqs.data.requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-bold tabular-nums">{Number(r.requested_amount).toLocaleString()} <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">pts</span></div>
                  <div className="text-[11px] text-[var(--color-ink-muted)]">
                    {new Date(r.submitted_at ?? r.requested_at).toLocaleString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="text-[11px] text-destructive mt-1">Reason: {r.rejection_reason}</div>
                  )}
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="uppercase tracking-wider text-[10px]">
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </StencilPanel>
    </PageShell>
  );
}

function ReferenceIdRow({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      toast.success("Reference ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy"); }
  }
  return (
    <div className="flex items-center gap-2 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2 py-1.5">
      <code className="flex-1 font-mono text-sm sm:text-base tracking-wider leading-tight select-all text-[var(--color-neon)]">
        {reference || "—"}
      </code>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={copy} disabled={!reference}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="ml-1 text-xs">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

function CopiableValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label || "Value"} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy"); }
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-mono tabular-nums leading-tight font-medium select-all">{value}</span>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
