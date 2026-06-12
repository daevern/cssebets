import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStaffCounts, listAuditLog } from "@/lib/management.functions";
import { Users, FileCheck, ScrollText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/management/admin")({
  head: () => ({ meta: [{ title: "Admin — CSSE Management" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const countsFn = useServerFn(getStaffCounts);
  const counts = useQuery({ queryKey: ["mgmt-counts"], queryFn: () => countsFn({}), refetchInterval: 20_000 });
  const auditFn = useServerFn(listAuditLog);
  const audit = useQuery({ queryKey: ["mgmt-audit"], queryFn: () => auditFn({ data: { limit: 50 } }) });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Admin dashboard</h1>
        <p className="text-sm text-slate-400">Oversee staff actions and use the full admin tools.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Pending users" value={counts.data?.pendingUsers ?? 0} icon={Users} />
        <StatCard label="Pending point requests" value={counts.data?.pendingPointRequests ?? 0} icon={FileCheck} />
        <StatCard label="Recent audit events" value={audit.data?.rows.length ?? 0} icon={ScrollText} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Full admin tools</h2>
        </div>
        <p className="text-xs text-slate-400">
          Bankroll, matches, predictions, simulation, wallet ledger — open the existing admin app:
        </p>
        <Link to="/admin">
          <Button className="bg-amber-500 hover:bg-amber-600 text-slate-950">
            Open admin app <ExternalLink className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4 text-amber-400" /> Support audit log</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto text-xs">
          {(audit.data?.rows ?? []).map((r: any) => (
            <div key={r.id} className="border-b border-slate-800 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-amber-400">{r.action_type}</span>
                <span className="text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="text-slate-400">
                actor {r.actor_id?.slice(0, 8)} ({r.actor_role ?? "?"}) ·
                target {r.target_type ?? "?"} {r.target_id?.slice(0, 8) ?? ""}
                {r.reason && ` · "${r.reason}"`}
              </div>
            </div>
          ))}
          {(audit.data?.rows ?? []).length === 0 && <div className="text-slate-500">No events yet.</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-amber-400" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
