import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListPayouts,
  adminApprovePayout,
  adminRejectPayout,
  adminConfirmPayoutProof,
  getPayoutProofSignedUrl,
} from "@/lib/payout.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Banknote, Loader2, Upload, Eye, FileCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/payouts")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Payouts — Admin" }] }),
  component: AdminPayoutPage,
});

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;
const BUCKET = "payout-proofs";

function AdminPayoutPage() {
  const listFn = useServerFn(adminListPayouts);
  const approveFn = useServerFn(adminApprovePayout);
  const rejectFn = useServerFn(adminRejectPayout);
  const confirmProofFn = useServerFn(adminConfirmPayoutProof);
  const proofFn = useServerFn(getPayoutProofSignedUrl);
  const qc = useQueryClient();

  const [status, setStatus] = useState<"active" | "pending" | "approved" | "proof_uploaded" | "completed" | "rejected" | "all">("active");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [proof, setProof] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploadFor, setUploadFor] = useState<{ id: string; userId: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const payouts = useQuery({
    queryKey: ["admin-payouts", status],
    queryFn: () => listFn({ data: { status } }),
    refetchInterval: 15000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { payoutId: id } }),
    onSuccess: () => {
      toast.success("Approved. Points debited.");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
      qc.invalidateQueries({ queryKey: ["pending-payout-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      rejectFn({ data: { payoutId: vars.id, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Rejected.");
      setRejectFor(null); setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
      qc.invalidateQueries({ queryKey: ["pending-payout-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function viewProof(id: string) {
    try {
      const r: any = await proofFn({ data: { payoutId: id } });
      setProof(r);
    } catch (e) { toast.error((e as Error).message); }
  }

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (!ACCEPTED.includes(f.type)) { toast.error("Unsupported file type."); return; }
    if (f.size > MAX_SIZE) { toast.error("File too large (max 10MB)."); return; }
    setFile(f);
  }

  async function uploadProofAndConfirm() {
    if (!uploadFor || !file) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `payouts/${uploadFor.userId}/${uploadFor.id}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw new Error(upErr.message);
      await confirmProofFn({
        data: {
          payoutId: uploadFor.id,
          filePath: path,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      });
      toast.success("Proof uploaded. Awaiting user confirmation.");
      setUploadFor(null); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
      qc.invalidateQueries({ queryKey: ["pending-payout-count"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Banknote className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Payout Requests</h1>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Requests</h2>
          <div className="flex flex-wrap gap-1">
            {(["active","pending","approved","proof_uploaded","completed","rejected","all"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>

        {payouts.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !payouts.data?.payouts.length ? (
          <p className="text-sm text-muted-foreground">No payout requests.</p>
        ) : (
          <div className="space-y-3">
            {payouts.data.payouts.map((p: any) => (
              <div key={p.id} className="border rounded-md p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-semibold">{p.display_name}</div>
                    {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    <div className="text-xs text-muted-foreground">
                      Amount <span className="font-medium text-foreground tabular-nums">{Number(p.amount).toLocaleString()} pts</span>
                      {" · "}Balance <span className="tabular-nums">{Number(p.current_balance).toLocaleString()}</span>
                    </div>
                    <div className="text-xs">
                      Bank: <span className="font-medium">{p.bank_name}</span> · Acc <span className="font-mono">{p.bank_account_number}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(p.created_at).toLocaleString()}
                    </div>
                    {p.rejection_reason && p.status === "rejected_by_admin" && (
                      <div className="text-xs text-destructive">Rejected (admin): {p.rejection_reason}</div>
                    )}
                    {p.user_rejection_reason && p.status === "rejected_by_user" && (
                      <div className="text-xs text-destructive">Rejected (user): {p.user_rejection_reason}</div>
                    )}
                    {p.proof_file_path && (
                      <div className="text-xs text-green-600 flex items-center gap-1">
                        <FileCheck className="h-3.5 w-3.5" /> Proof: {p.proof_file_name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Badge variant={
                      p.status === "completed" ? "default" :
                      p.status.startsWith("rejected") ? "destructive" : "secondary"
                    }>{p.status.replace(/_/g, " ")}</Badge>
                    {p.proof_file_path && (
                      <Button size="sm" variant="outline" onClick={() => viewProof(p.id)}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                    )}
                    {p.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => { setRejectFor(p.id); setRejectReason(""); }}>Reject</Button>
                      </>
                    )}
                    {p.status === "approved" && (
                      <Button size="sm" onClick={() => { setUploadFor({ id: p.id, userId: p.user_id }); setFile(null); }}>
                        <Upload className="h-4 w-4 mr-1" /> Upload proof
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Proof viewer */}
      <Dialog open={!!proof} onOpenChange={(o) => !o && setProof(null)}>
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

      {/* Reject reason */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payout request</DialogTitle>
            <DialogDescription>Provide a reason. The user will see this.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 3 || reject.isPending}
              onClick={() => rejectFor && reject.mutate({ id: rejectFor, reason: rejectReason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload proof */}
      <Dialog open={!!uploadFor} onOpenChange={(o) => { if (!o) { setUploadFor(null); setFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload proof of payment</DialogTitle>
            <DialogDescription>PDF/JPG/PNG/WEBP, max 10MB. Click confirm to notify the user.</DialogDescription>
          </DialogHeader>
          <Input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
          />
          {file && <p className="text-xs text-muted-foreground truncate">Selected: {file.name}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadFor(null); setFile(null); }} disabled={uploading}>Cancel</Button>
            <Button disabled={!file || uploading} onClick={uploadProofAndConfirm}>
              {uploading ? "Uploading…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
