import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listUsersAdmin, getUserDetail, updateUserDisplayName, setUserSuspended,
  resetUserBalance, setUserRole, deleteUserAccount,
} from "@/lib/admin-dashboard.functions";
import { listPendingUsers, approveUser } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const qc = useQueryClient();
  const { isSuperAdmin, isViewer } = useAuth();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const listFn = useServerFn(listUsersAdmin);
  const pendingFn = useServerFn(listPendingUsers);
  const approveFn = useServerFn(approveUser);

  const users = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => listFn({ data: { search } }),
  });
  const pending = useQuery({
    queryKey: ["admin-pending"],
    queryFn: () => pendingFn({}),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveFn({ data: { targetUserId: id } }),
    onSuccess: () => {
      toast.success("Approved");
      qc.invalidateQueries({ queryKey: ["admin-pending"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">Manage accounts, balances and roles. All actions are audited.</p>
      </div>

      {!!pending.data?.users?.length && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">Pending approvals</h2>
          <div className="space-y-2">
            {pending.data.users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="text-sm">
                  <div className="font-medium">{u.display_name || u.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
                <Button size="sm" onClick={() => approveMut.mutate(u.id)} disabled={isViewer || approveMut.isPending}>Approve</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
          <Input
            placeholder="Search by display name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-sm"
          />
          <span className="text-xs text-muted-foreground">{users.data?.users?.length ?? 0} users</span>
        </div>
        {users.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Preds</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data?.users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.display_name}</TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.balance.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.predictions}</TableCell>
                    <TableCell>
                      {u.suspended
                        ? <Badge variant="destructive">Suspended</Badge>
                        : <Badge variant="secondary">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(u.id)}>Manage</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {openId && (
        <UserDrawer
          userId={openId}
          onClose={() => setOpenId(null)}
          canWrite={!isViewer}
          canRole={isSuperAdmin}
          canDelete={isSuperAdmin}
        />
      )}
    </div>
  );
}

function UserDrawer({
  userId, onClose, canWrite, canRole,
}: { userId: string; onClose: () => void; canWrite: boolean; canRole: boolean }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getUserDetail);
  const renameFn = useServerFn(updateUserDisplayName);
  const suspendFn = useServerFn(setUserSuspended);
  const resetFn = useServerFn(resetUserBalance);
  const roleFn = useServerFn(setUserRole);

  const detail = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => detailFn({ data: { userId } }),
  });

  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [resetTo, setResetTo] = useState("1000");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-user", userId] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const rename = useMutation({
    mutationFn: () => renameFn({ data: { targetUserId: userId, displayName: name, reason } }),
    onSuccess: () => { toast.success("Name updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const suspend = useMutation({
    mutationFn: (suspended: boolean) => suspendFn({
      data: {
        targetUserId: userId,
        suspended,
        reason: reason.trim() || (suspended ? "Admin account suspension" : "Admin account unsuspension"),
      },
    }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: () => resetFn({ data: { targetUserId: userId, target: Number(resetTo), reason } }),
    onSuccess: () => { toast.success("Balance reset"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setRole = useMutation({
    mutationFn: (v: { role: any; add: boolean }) =>
      roleFn({ data: { targetUserId: userId, role: v.role, add: v.add, reason } }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detail.data;
  const hasRole = (r: string) => (d?.roles ?? []).includes(r);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User · {d?.profile?.display_name ?? "…"}</DialogTitle>
          <DialogDescription>Suspending or unsuspending an account requires a reason and admin privileges.</DialogDescription>
        </DialogHeader>
        {detail.isLoading || !d ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="text-xl font-bold tabular-nums">{Number(d.wallet?.balance ?? 0).toLocaleString()}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">Predictions</div>
                <div className="text-xl font-bold tabular-nums">{d.predictions.length}</div>
              </Card>
            </div>

            {(d.email || d.phoneNumber) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {d.email && (
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="text-sm font-medium select-all">{d.email}</div>
                  </Card>
                )}
                {d.phoneNumber && (
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Phone Number</div>
                    <div className="text-sm font-medium select-all">{d.phoneNumber}</div>
                  </Card>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Reason (required for any change)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. user requested rename" />
            </div>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-semibold">Display name</div>
              <div className="flex gap-2">
                <Input
                  placeholder={d.profile?.display_name ?? ""}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button onClick={() => rename.mutate()} disabled={!canWrite || !name || !reason || rename.isPending}>
                  Save
                </Button>
              </div>
            </Card>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-semibold">Suspension</div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={!canWrite || d.profile?.suspended || suspend.isPending}
                  onClick={() => suspend.mutate(true)}
                >
                  Suspend
                </Button>
                <Button
                  variant="outline"
                  disabled={!canWrite || !d.profile?.suspended || suspend.isPending}
                  onClick={() => suspend.mutate(false)}
                >
                  Unsuspend
                </Button>
              </div>
            </Card>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-semibold">Reset virtual balance</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={resetTo}
                  onChange={(e) => setResetTo(e.target.value)}
                  className="max-w-[160px]"
                />
                <Button onClick={() => reset.mutate()} disabled={!canWrite || !reason || reset.isPending}>
                  Reset
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Adjusts balance to the target via an audited wallet transaction.
              </p>
            </Card>

            {canRole && (
              <Card className="p-3 space-y-2">
                <div className="text-sm font-semibold">Roles</div>
                <div className="flex flex-wrap gap-2">
                  {(["super_admin", "admin", "viewer", "member"] as const).map((r) => {
                    const on = hasRole(r);
                    return (
                      <Button
                        key={r}
                        size="sm"
                        variant={on ? "default" : "outline"}
                        disabled={!reason || setRole.isPending}
                        onClick={() => setRole.mutate({ role: r, add: !on })}
                      >
                        {on ? `Remove ${r}` : `Add ${r}`}
                      </Button>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className="p-3 space-y-2">
              <div className="text-sm font-semibold">Recent predictions</div>
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Stake</TableHead>
                      <TableHead className="text-right">Pts</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.predictions.slice(0, 30).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{p.market}</TableCell>
                        <TableCell className="text-xs">{p.outcome}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{Number(p.virtual_stake).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{p.points}</TableCell>
                        <TableCell className="text-xs uppercase">{p.status}</TableCell>
                      </TableRow>
                    ))}
                    {!d.predictions.length && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No predictions.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
