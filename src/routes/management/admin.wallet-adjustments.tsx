import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  requestWalletAdjustment,
  approveWalletAdjustment,
  rejectWalletAdjustment,
  cancelWalletAdjustment,
  listWalletAdjustmentRequests,
  adminListUsers,
  setSelfApprovalPolicy,
} from "@/lib/wallet.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Wallet as WalletIcon, ShieldAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/management/admin/wallet-adjustments")({
  head: () => ({ meta: [{ title: "Wallet Adjustments — Admin" }] }),
  component: WalletAdjustmentsPage,
});

function WalletAdjustmentsPage() {
  const listFn = useServerFn(listWalletAdjustmentRequests);
  const usersFn = useServerFn(adminListUsers);
  const requestFn = useServerFn(requestWalletAdjustment);
  const approveFn = useServerFn(approveWalletAdjustment);
  const rejectFn = useServerFn(rejectWalletAdjustment);
  const cancelFn = useServerFn(cancelWalletAdjustment);
  const policyFn = useServerFn(setSelfApprovalPolicy);
  const qc = useQueryClient();

  const [status, setStatus] = useState<"pending" | "applied" | "rejected" | "cancelled" | "all">("pending");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [checkerNote, setCheckerNote] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["wallet-adjustments", status],
    queryFn: () => listFn({ data: { status } }),
    refetchInterval: 15000,
  });
  const users = useQuery({ queryKey: ["admin-users-wallets"], queryFn: () => usersFn({}) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wallet-adjustments"] });
    qc.invalidateQueries({ queryKey: ["admin-users-wallets"] });
  };

  const approve = useMutation({
    mutationFn: (v: { id: string; note?: string }) => approveFn({ data: { requestId: v.id, checkerNote: v.note } }),
    onSuccess: (r: any) => { toast.success(r?.self_approval ? "Applied (self-approval audit-logged)" : "Applied"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectFn({ data: { requestId: v.id, rejectionReason: v.reason } }),
    onSuccess: () => { toast.success("Rejected"); setRejectFor(null); setRejectReason(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { requestId: id } }),
    onSuccess: () => { toast.success("Cancelled"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const policy = useMutation({
    mutationFn: (allow: boolean) => policyFn({ data: { allow } }),
    onSuccess: () => { toast.success("Policy updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <WalletIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Wallet Adjustment Requests</h1>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Single-admin self-approval</div>
            <div className="text-xs text-muted-foreground">
              When ON, the same admin may both request and approve. All self-approvals are audit-logged.
            </div>
          </div>
          <Switch
            checked={!!list.data?.allowSelfApproval}
            onCheckedChange={(v) => policy.mutate(v)}
            disabled={policy.isPending}
          />
        </div>
      </Card>

      <RequestForm
        users={users.data?.users ?? []}
        onSubmit={async (payload) => {
          try {
            await requestFn({ data: payload });
            toast.success("Adjustment request created — awaiting approval.");
            invalidate();
          } catch (e) { toast.error((e as Error).message); }
        }}
      />

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Requests</h2>
          <div className="flex flex-wrap gap-1">
            {(["pending", "applied", "rejected", "cancelled", "all"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>

        {list.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !list.data?.requests.length ? (
          <p className="text-sm text-muted-foreground">No {status} requests.</p>
        ) : (
          <div className="space-y-3">
            {list.data.requests.map((r: any) => {
              const isPending = r.status === "pending";
              const selfWouldBe = false; // We don't know current admin id here; server enforces.
              return (
                <div key={r.id} className="border rounded-md p-3 text-sm space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={r.adjustment_type === "credit" ? "default" : "destructive"}>
                          {r.adjustment_type.toUpperCase()}
                        </Badge>
                        <span className="font-semibold tabular-nums">{Number(r.amount).toLocaleString()} pts</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{r.target_name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Requested by <span className="text-foreground">{r.requested_by_name}</span>{" · "}
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                      <div className="text-xs">Reason: {r.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        Before: <span className="tabular-nums">{r.before_balance != null ? Number(r.before_balance).toLocaleString() : "—"}</span>
                        {r.after_balance != null && (
                          <>{" · "}After: <span className="tabular-nums">{Number(r.after_balance).toLocaleString()}</span></>
                        )}
                      </div>
                      {r.approved_by_name && (
                        <div className="text-xs text-emerald-500">
                          Approved by {r.approved_by_name} · {r.approved_at ? new Date(r.approved_at).toLocaleString() : ""}
                        </div>
                      )}
                      {r.rejected_by_name && (
                        <div className="text-xs text-destructive">
                          Rejected by {r.rejected_by_name}: {r.rejection_reason}
                        </div>
                      )}
                      {(r.metadata as any)?.self_approval && (
                        <div className="text-[11px] text-amber-500">
                          Self-approval (audit-logged, platform setting allowed).
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge variant={
                        r.status === "applied" ? "default" :
                        r.status === "rejected" || r.status === "cancelled" ? "destructive" : "secondary"
                      }>{r.status}</Badge>
                      {isPending && (
                        <>
                          <Input
                            placeholder="Checker note (optional)"
                            value={checkerNote[r.id] ?? ""}
                            onChange={(e) => setCheckerNote((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-56"
                          />
                          {!list.data?.allowSelfApproval && (
                            <p className="text-[10px] text-muted-foreground">
                              A different admin must approve.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate({ id: r.id, note: checkerNote[r.id] })}
                            >
                              Approve & apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setRejectFor(r.id); setRejectReason(""); }}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel.mutate(r.id)}
                              disabled={cancel.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject wallet adjustment</DialogTitle>
            <DialogDescription>Provide a reason. Audit logged.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
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
    </div>
  );
}

function RequestForm({
  users,
  onSubmit,
}: {
  users: Array<{ id: string; display_name: string | null; balance: number }>;
  onSubmit: (v: { targetUserId: string; amount: number; adjustmentType: "credit" | "debit"; reason: string }) => void;
}) {
  const [targetUserId, setTarget] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState<string>("");
  const canSubmit = targetUserId && Number(amount) > 0 && reason.trim().length >= 3;
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">New adjustment request</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Target user</label>
          <Select value={targetUserId} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name ?? u.id.slice(0, 8)} · {Number(u.balance).toLocaleString()} pts
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as "credit" | "debit")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit (+)</SelectItem>
              <SelectItem value="debit">Debit (−)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Amount (positive)</label>
          <Input
            type="number" min={0} step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Reason (required)</label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <Button
        disabled={!canSubmit}
        onClick={() => {
          onSubmit({ targetUserId, amount: Number(amount), adjustmentType: type, reason: reason.trim() });
          setAmount(""); setReason("");
        }}
      >
        Submit request
      </Button>
      <p className="text-xs text-muted-foreground">
        A second admin approves before the wallet is touched. If self-approval is enabled, the same admin can approve —
        audit-logged.
      </p>
    </Card>
  );
}
