import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getStaffCounts,
  staffListPendingUsers,
  staffApproveUser,
  staffRejectUser,
  staffListPointRequests,
  staffApprovePointRequest,
  staffRejectPointRequest,
  staffGetProofSignedUrl,
} from "@/lib/management.functions";
import { useState } from "react";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Users, FileCheck, Check, X, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/support")({
  head: () => ({ meta: [{ title: "Support — cssebets management" }] }),
  component: SupportDashboard,
});

function SupportDashboard() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending-users" | "point-requests">("pending-users");

  const hasSession = useHasSession();
  const countsFn = useServerFn(getStaffCounts);
  const counts = useQuery({
    queryKey: ["mgmt-counts"],
    queryFn: () => withSession(() => countsFn({})),
    refetchInterval: 20_000,
    enabled: hasSession === true,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Support dashboard</h1>
        <p className="text-sm text-slate-400">Approve users and point requests.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending users" value={counts.data?.pendingUsers ?? 0} icon={Users} />
        <StatCard label="Pending point requests" value={counts.data?.pendingPointRequests ?? 0} icon={FileCheck} />
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <TabButton active={tab === "pending-users"} onClick={() => setTab("pending-users")}>
          Pending users
        </TabButton>
        <TabButton active={tab === "point-requests"} onClick={() => setTab("point-requests")}>
          Point requests
        </TabButton>
      </div>

      {tab === "pending-users" ? <PendingUsersPanel onChanged={() => qc.invalidateQueries({ queryKey: ["mgmt-counts"] })} /> : <PointRequestsPanel onChanged={() => qc.invalidateQueries({ queryKey: ["mgmt-counts"] })} />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-violet-300" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active ? "border-violet-400 text-violet-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
    >
      {children}
    </button>
  );
}

// ============= PENDING USERS =============

function PendingUsersPanel({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(staffListPendingUsers);
  const approveFn = useServerFn(staffApproveUser);
  const rejectFn = useServerFn(staffRejectUser);
  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["staff-pending-users"],
    queryFn: () => withSession(() => listFn({})),
    refetchInterval: 30_000,
    enabled: hasSession === true,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(uid: string) {
    setBusyId(uid);
    try {
      const r = await approveFn({ data: { targetUserId: uid } });
      toast.success(r.alreadyApproved ? "Already approved" : "User approved");
      qc.invalidateQueries({ queryKey: ["staff-pending-users"] });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }

  async function reject(uid: string) {
    const reason = window.prompt("Reason for rejecting this user?");
    if (!reason || !reason.trim()) return;
    setBusyId(uid);
    try {
      await rejectFn({ data: { targetUserId: uid, reason: reason.trim() } });
      toast.success("User rejected");
      qc.invalidateQueries({ queryKey: ["staff-pending-users"] });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }

  if (q.isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  const users = q.data?.users ?? [];
  if (!users.length) return <div className="py-8 text-center text-slate-400">No pending users.</div>;

  return (
    <div className="space-y-3">
      {users.map((u: any) => (
        <div key={u.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="font-semibold">{u.display_name || "(no name)"}</div>
            <div className="text-xs text-slate-400 flex flex-wrap gap-x-3">
              {u.public_reference && <span className="text-violet-300 font-mono">{u.public_reference}</span>}
              {u.email && <span>{u.email}</span>}
              {u.phone && <span>{u.phone}</span>}
            </div>
            <div className="text-[11px] text-slate-500">Requested {new Date(u.created_at).toLocaleString()}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => approve(u.id)} disabled={busyId === u.id} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => reject(u.id)} disabled={busyId === u.id} className="border-red-700 text-red-400 hover:bg-red-950">
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============= POINT REQUESTS =============

function PointRequestsPanel({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [filter, setFilter] = useState("");

  const listFn = useServerFn(staffListPointRequests);
  const approveFn = useServerFn(staffApprovePointRequest);
  const rejectFn = useServerFn(staffRejectPointRequest);
  const proofFn = useServerFn(staffGetProofSignedUrl);

  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["staff-point-requests", status],
    queryFn: () => withSession(() => listFn({ data: { status } })),
    refetchInterval: 30_000,
    enabled: hasSession === true,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const r = await approveFn({ data: { requestId: id } });
      toast.success(`Approved. New balance ${r.newBalance.toLocaleString()}`);
      qc.invalidateQueries({ queryKey: ["staff-point-requests"] });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }
  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting?");
    if (!reason?.trim()) return;
    setBusyId(id);
    try {
      await rejectFn({ data: { requestId: id, reason: reason.trim() } });
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["staff-point-requests"] });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }
  async function viewProof(id: string) {
    try {
      const r = await proofFn({ data: { requestId: id } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const rows = (q.data?.requests ?? []).filter((r: any) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return [r.public_reference, r.email, r.phone, r.display_name, r.user_id]
      .some((v: any) => v && String(v).toLowerCase().includes(f));
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs capitalize ${status === s ? "bg-violet-900 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search ref / email / phone / name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-slate-800 border-slate-700 text-slate-100 max-w-md"
        />
      </div>
      {q.isLoading ? (
        <div className="py-8 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No requests.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r: any) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.display_name}</span>
                    {r.public_reference && <span className="text-violet-300 font-mono text-xs">{r.public_reference}</span>}
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      r.status === "pending" ? "bg-violet-900/20 text-violet-300" :
                      r.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-3">
                    {r.email && <span>{r.email}</span>}
                    {r.phone && <span>{r.phone}</span>}
                  </div>
                  <div className="text-sm">
                    Requesting <span className="font-bold text-violet-300">{Number(r.requested_amount).toLocaleString()} pts</span>
                    <span className="text-slate-500"> · current balance {r.current_balance.toLocaleString()}</span>
                  </div>
                  {r.reason && <div className="text-xs text-slate-400 italic">"{r.reason}"</div>}
                  {r.rejection_reason && <div className="text-xs text-red-400">Rejected: {r.rejection_reason}</div>}
                  <div className="text-[11px] text-slate-500">{new Date(r.requested_at).toLocaleString()}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {r.proof_file_path && (
                    <Button size="sm" variant="outline" onClick={() => viewProof(r.id)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                      <Eye className="h-4 w-4 mr-1" /> View proof
                    </Button>
                  )}
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => approve(r.id)} disabled={busyId === r.id} className="bg-emerald-600 hover:bg-emerald-700">
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(r.id)} disabled={busyId === r.id} className="border-red-700 text-red-400 hover:bg-red-950">
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
