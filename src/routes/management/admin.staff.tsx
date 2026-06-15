import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listStaffAdmin, getUserDetail, updateUserDisplayName, setUserSuspended,
  setUserRole, deleteUserAccount,
} from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/staff")({
  component: AdminStaffPage,
});

const STAFF_ROLES = ["super_admin", "admin", "customer_support", "viewer"] as const;

function AdminStaffPage() {
  const qc = useQueryClient();
  const { isSuperAdmin, isViewer } = useAuth();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const listFn = useServerFn(listStaffAdmin);
  const staff = useQuery({
    queryKey: ["admin-staff", search],
    queryFn: () => listFn({ data: { search } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Admins, super admins, customer support, and viewers. These accounts are excluded from the Users table and platform user counts. All actions are audited.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
          <Input
            placeholder="Search by display name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-sm"
          />
          <span className="text-xs text-muted-foreground">{staff.data?.staff?.length ?? 0} staff</span>
        </div>
        {staff.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(staff.data?.staff ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.display_name}</TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                    </TableCell>
                    <TableCell>
                      {u.suspended
                        ? <Badge variant="destructive">Suspended</Badge>
                        : <Badge variant="secondary">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(u.id)}>Manage</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!staff.data?.staff?.length && !staff.isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No staff members.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {openId && (
        <StaffDrawer
          userId={openId}
          onClose={() => setOpenId(null)}
          canWrite={!isViewer}
          canRole={isSuperAdmin}
          canDelete={isSuperAdmin}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["admin-staff"] });
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
    </div>
  );
}

function StaffDrawer({
  userId, onClose, canWrite, canRole, canDelete, onChanged,
}: {
  userId: string; onClose: () => void;
  canWrite: boolean; canRole: boolean; canDelete: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getUserDetail);
  const renameFn = useServerFn(updateUserDisplayName);
  const suspendFn = useServerFn(setUserSuspended);
  const roleFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteUserAccount);

  const detail = useQuery({
    queryKey: ["admin-staff-user", userId],
    queryFn: () => detailFn({ data: { userId } }),
  });

  const [name, setName] = useState("");
  const [reason, setReason] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-staff-user", userId] });
    onChanged();
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
        reason: reason.trim() || (suspended ? "Admin staff suspension" : "Admin staff unsuspension"),
      },
    }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setRole = useMutation({
    mutationFn: (v: { role: any; add: boolean }) =>
      roleFn({ data: { targetUserId: userId, role: v.role, add: v.add, reason } }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { targetUserId: userId, reason } }),
    onSuccess: () => { toast.success("Staff account deleted"); onChanged(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detail.data;
  const hasRole = (r: string) => (d?.roles ?? []).includes(r);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Staff · {d?.profile?.display_name ?? "…"}</DialogTitle>
          <DialogDescription>
            Edit role assignments, rename, suspend, or delete this staff account. All changes require a reason and are audited.
          </DialogDescription>
        </DialogHeader>
        {detail.isLoading || !d ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4">
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
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. promoted to admin" />
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

            {canRole && (
              <Card className="p-3 space-y-2">
                <div className="text-sm font-semibold">Roles</div>
                <div className="flex flex-wrap gap-2">
                  {STAFF_ROLES.map((r) => {
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
                <p className="text-[11px] text-muted-foreground">
                  Removing every staff role moves this account back to the Users table.
                </p>
              </Card>
            )}

            {canDelete && (
              <Card className="p-3 space-y-2 border-destructive/40">
                <div className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> Danger zone
                </div>
                <p className="text-xs text-muted-foreground">
                  Permanently deletes the staff account and login. This cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  disabled={!reason || remove.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${d.profile?.display_name}? This cannot be undone.`)) {
                      remove.mutate();
                    }
                  }}
                >
                  Delete staff account
                </Button>
              </Card>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
