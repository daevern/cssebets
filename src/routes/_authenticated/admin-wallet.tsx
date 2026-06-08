import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminListUsers,
  adminAdjustWallet,
} from "@/lib/wallet.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin-wallet")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Wallet Admin — WC26 Pool" }] }),
  component: AdminWalletPage,
});

function AdminWalletPage() {
  const listFn = useServerFn(adminListRequests);
  const approveFn = useServerFn(adminApproveRequest);
  const rejectFn = useServerFn(adminRejectRequest);
  const usersFn = useServerFn(adminListUsers);
  const adjustFn = useServerFn(adminAdjustWallet);
  const qc = useQueryClient();

  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const requests = useQuery({
    queryKey: ["admin-point-requests", status],
    queryFn: () => listFn({ data: { status } }),
  });
  const users = useQuery({ queryKey: ["admin-users-wallets"], queryFn: () => usersFn({}) });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { requestId: id } }),
    onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["admin-point-requests"] }); qc.invalidateQueries({ queryKey: ["admin-users-wallets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { requestId: id } }),
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["admin-point-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <WalletIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Wallet Admin</h1>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Point requests</h2>
          <div className="flex gap-1">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
        {requests.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !requests.data?.requests.length ? (
          <p className="text-sm text-muted-foreground">No {status} requests.</p>
        ) : (
          <div className="space-y-2">
            {requests.data.requests.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.display_name} — {Number(r.requested_amount).toLocaleString()} pts</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {new Date(r.requested_at).toLocaleString()}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>Reject</Button>
                  </div>
                ) : (
                  <Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
                )}
              </div>
            ))}
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
