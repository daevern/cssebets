import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSupportAccounts,
  setSupportAccountSuspended,
  seedSupportAccounts,
  resetSupportPassword,
} from "@/lib/management.functions";
import { Button } from "@/components/ui/button";
import { Users, Loader2, ShieldCheck, ShieldOff, Sparkles, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — CSSE Management" }] }),
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSupportAccounts);
  const toggleFn = useServerFn(setSupportAccountSuspended);
  const seedFn = useServerFn(seedSupportAccounts);
  const resetFn = useServerFn(resetSupportPassword);

  const q = useQuery({ queryKey: ["support-accounts"], queryFn: () => listFn({}) });
  const [busy, setBusy] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function resetPw(uid: string, email: string) {
    const np = window.prompt(`New password for ${email}? (min 8 chars). User will be forced to change it on next login.`);
    if (!np || np.length < 8) { if (np) toast.error("Min 8 characters"); return; }
    setBusy(uid);
    try {
      await resetFn({ data: { targetUserId: uid, newPassword: np } });
      toast.success("Password reset");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  async function toggle(uid: string, suspended: boolean) {
    setBusy(uid);
    try {
      await toggleFn({ data: { targetUserId: uid, suspended } });
      toast.success(suspended ? "Disabled" : "Enabled");
      qc.invalidateQueries({ queryKey: ["support-accounts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  async function seed() {
    if (!confirm("Seed 10 customer support accounts (support01..10@cssebets.com / 123456789)?")) return;
    setSeeding(true);
    try {
      const r = await seedFn({});
      const created = r.results.filter((x: any) => x.status === "created").length;
      const existed = r.results.filter((x: any) => x.status === "existed").length;
      const errored = r.results.filter((x: any) => x.status === "error").length;
      toast.success(`Created ${created}, existed ${existed}, errors ${errored}`);
      qc.invalidateQueries({ queryKey: ["support-accounts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSeeding(false); }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Super admin</h1>
          <p className="text-sm text-slate-400">Manage customer support accounts.</p>
        </div>
        <Button onClick={seed} disabled={seeding} className="bg-amber-500 hover:bg-amber-600 text-slate-950">
          <Sparkles className="h-4 w-4 mr-1" /> {seeding ? "Seeding…" : "Seed 10 support accounts"}
        </Button>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-amber-400" /> Customer support accounts</h2>
        {q.isLoading ? (
          <div className="py-6 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (q.data?.accounts ?? []).length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">No support accounts yet. Click "Seed 10 support accounts" above.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {q.data!.accounts.map((a: any) => (
              <div key={a.id} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <div className="font-semibold">{a.display_name || "(no name)"}</div>
                  <div className="text-xs text-slate-400">{a.email ?? "?"}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.suspended ? "disabled" : "active"}
                    {a.last_sign_in_at ? ` · last sign-in ${new Date(a.last_sign_in_at).toLocaleString()}` : " · never signed in"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetPw(a.id, a.email ?? a.id)}
                    disabled={busy === a.id}
                    className="border-amber-700 text-amber-400 hover:bg-amber-950"
                  >
                    <KeyRound className="h-4 w-4 mr-1" /> Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle(a.id, !a.suspended)}
                    disabled={busy === a.id}
                    className={a.suspended ? "border-emerald-700 text-emerald-400 hover:bg-emerald-950" : "border-red-700 text-red-400 hover:bg-red-950"}
                  >
                    {a.suspended ? <><ShieldCheck className="h-4 w-4 mr-1" /> Enable</> : <><ShieldOff className="h-4 w-4 mr-1" /> Disable</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
