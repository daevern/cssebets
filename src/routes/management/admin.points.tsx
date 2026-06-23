import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminListUsers,
  adminAdjustWallet,
  adminGetProofSignedUrl,
} from "@/lib/wallet.functions";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Wallet as WalletIcon, FileText, Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/management/admin/points")({
  head: () => ({ meta: [{ title: "Point Requests — cssebets" }] }),
  component: AdminWalletPage,
});

function AdminWalletPage() {
  const listFn = useServerFn(adminListRequests);
  const approveFn = useServerFn(adminApproveRequest);
  const rejectFn = useServerFn(adminRejectRequest);
  const usersFn = useServerFn(adminListUsers);
  const adjustFn = useServerFn(adminAdjustWallet);
  const proofFn = useServerFn(adminGetProofSignedUrl);
  const qc = useQueryClient();

  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [proof, setProof] = useState<{ url: string; type: string; name: string } | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [search, setSearch] = useState("");

  const requests = useQuery({
    queryKey: ["admin-point-requests", status],
    queryFn: () => listFn({ data: { status } }),
    refetchInterval: 15000,
  });
  const users = useQuery({ queryKey: ["admin-users-wallets"], queryFn: () => usersFn({}) });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Approved");
      qc.invalidateQueries({ queryKey: ["admin-point-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-users-wallets"] });
      qc.invalidateQueries({ queryKey: ["pending-point-request-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectFn({ data: { requestId: id, rejectionReason: reason } }),
    onSuccess: () => {
      toast.success("Rejected");
      setRejectFor(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin-point-requests"] });
      qc.invalidateQueries({ queryKey: ["pending-point-request-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function viewProof(id: string) {
    try {
      const res: any = await proofFn({ data: { requestId: id } });
      setProof(res);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <WalletIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Point Requests</h1>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Requests</h2>
          <div className="flex gap-1">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Reference ID, UUID, name, email, or phone…"
          className="max-w-md"
        />
        {requests.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !requests.data?.requests.length ? (
          <p className="text-sm text-muted-foreground">No {status} requests.</p>
        ) : (
          <div className="space-y-3">
            {(requests.data.requests as any[])
              .filter((r) => {
                if (!search.trim()) return true;
                const q = search.trim().toLowerCase();
                return (
                  String(r.public_reference ?? "").toLowerCase().includes(q) ||
                  String(r.user_id).toLowerCase().includes(q) ||
                  String(r.display_name ?? "").toLowerCase().includes(q) ||
                  String(r.email ?? "").toLowerCase().includes(q) ||
                  String(r.phone ?? "").toLowerCase().includes(q)
                );
              })
              .map((r: any) => {
              const hasProof = !!r.proof_file_path;
              return (
                <div key={r.id} className="border rounded-md p-3 text-sm space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wider">
                          {r.public_reference ?? "—"}
                        </span>
                        <span className="font-semibold">{r.display_name}</span>
                      </div>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                      {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                      <div className="text-[10px] text-muted-foreground/70 font-mono break-all">
                        UUID: {r.user_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Requested <span className="font-medium text-foreground">{Number(r.requested_amount).toLocaleString()} pts</span>
                        {" · "}Balance <span className="tabular-nums">{Number(r.current_balance).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Submitted: {new Date(r.submitted_at ?? r.requested_at).toLocaleString()}
                      </div>
                      {r.reason && <div className="text-xs">Note: {r.reason}</div>}
                      {r.status === "rejected" && r.rejection_reason && (
                        <div className="text-xs text-destructive">Rejected: {r.rejection_reason}</div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        {hasProof ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <FileText className="h-3.5 w-3.5" /> {r.proof_file_name ?? "proof"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" /> Missing proof file
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button size="sm" variant="outline" onClick={() => viewProof(r.id)} disabled={!hasProof}>
                        <Eye className="h-4 w-4 mr-1" /> View Proof
                      </Button>
                      {r.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approve.mutate(r.id)}
                            disabled={approve.isPending || !hasProof}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectFor(r.id); setRejectReason(""); }}
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Wallet adjustments</h2>
        <p className="text-xs text-muted-foreground">Positive amount = credit, negative = debit. Use sparingly.</p>
        {users.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : (
          <div className="space-y-2">
            {(users.data?.users ?? []).map((u: any) => (
              <AdjustRow
                key={u.id}
                user={u}
                onApply={async (amount, note) => {
                  try {
                    const r: any = await adjustFn({ data: { targetUserId: u.id, amount, note } });
                    toast.success(`New balance: ${r.newBalance}`);
                    qc.invalidateQueries({ queryKey: ["admin-users-wallets"] });
                  } catch (e) { toast.error((e as Error).message); }
                }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Proof viewer */}
      <Dialog open={!!proof} onOpenChange={(o) => !o && setProof(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Proof file</DialogTitle>
            <DialogDescription className="truncate">{proof?.name}</DialogDescription>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Signed URL expires in ~10 minutes.
          </p>
          {proof && (
            <div className="relative">
              {proof.type.startsWith("image/") ? (
                <img src={proof.url} alt={proof.name}  className="max-h-[70vh] w-full object-contain rounded " />
              ) : proof.type === "application/pdf" ? (
                <iframe src={proof.url} title={proof.name} className="w-full h-[70vh] rounded border" />
              ) : (
                <a href={proof.url} target="_blank" rel="noreferrer" className="text-primary underline">
                  Open file
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            {proof && (
              <Button asChild variant="outline">
                <a href={proof.url} target="_blank" rel="noreferrer" download={proof.name}>Open in new tab</a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject point request</DialogTitle>
            <DialogDescription>Provide a reason. The user will see this.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() => rejectFor && reject.mutate({ id: rejectFor, reason: rejectReason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdjustRow({ user, onApply }: { user: any; onApply: (amount: number, note?: string) => void }) {
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 border rounded-md p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{user.display_name || user.id.slice(0, 8)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">Balance: {Number(user.balance).toLocaleString()} pts</div>
      </div>
      <Input className="w-24" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="±amt" />
      <Input className="w-40" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <Button size="sm" disabled={!amt || Number(amt) === 0} onClick={() => { onApply(Number(amt), note || undefined); setAmt(""); setNote(""); }}>
        Apply
      </Button>
    </div>
  );
}
