import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  adminSyncF1All,
  adminSettleF1Race,
  adminF1SyncRuns,
  adminF1Liability,
  listF1Races,
} from "@/features/f1/f1.functions";

export const Route = createFileRoute("/management/admin/f1")({
  component: AdminF1Page,
});

function AdminF1Page() {
  const qc = useQueryClient();
  const syncFn = useServerFn(adminSyncF1All);
  const settleFn = useServerFn(adminSettleF1Race);
  const runsFn = useServerFn(adminF1SyncRuns);
  const liabFn = useServerFn(adminF1Liability);
  const racesFn = useServerFn(listF1Races);

  const runs = useQuery({ queryKey: ["adm-f1-runs"], queryFn: () => runsFn(), refetchInterval: 15_000 });
  const liab = useQuery({ queryKey: ["adm-f1-liab"], queryFn: () => liabFn(), refetchInterval: 30_000 });
  const races = useQuery({ queryKey: ["adm-f1-races"], queryFn: () => racesFn(), refetchInterval: 30_000 });

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: () => {
      toast.success("F1 sync complete");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">F1 Admin</h1>
          <p className="text-sm text-muted-foreground">Sync races, standings, and rebuild house odds.</p>
        </div>
        <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          {syncMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync all
        </Button>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Race calendar</h2>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Round</th><th>Name</th><th>Starts</th><th>Status</th><th>Liability</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(races.data?.races ?? []).map((r: any) => {
                const l = liab.data?.liability?.[r.id];
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1">{r.round}</td>
                    <td>{r.name}</td>
                    <td>{new Date(r.starts_at).toLocaleString()}</td>
                    <td>{r.status}</td>
                    <td className="font-mono">{l ? `${l.count} bets · ${l.totalPayout.toFixed(0)} pot` : "—"}</td>
                    <td>
                      {r.status !== "finished" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!confirm(`Settle ${r.name}? This uses live race results.`)) return;
                            try {
                              const res: any = await settleFn({ data: { raceId: r.id } });
                              toast.success(res.alreadySettled ? "Already settled" : `Settled ${res.settled} markets`);
                              qc.invalidateQueries();
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                        >
                          Settle
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Recent sync runs</h2>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Task</th><th>Status</th><th>Records</th><th>Duration</th><th>Started</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              {(runs.data?.runs ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1">{r.task}</td>
                  <td className={r.status === "error" ? "text-destructive" : ""}>{r.status}</td>
                  <td>{r.records ?? "—"}</td>
                  <td>{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                  <td>{new Date(r.started_at).toLocaleTimeString()}</td>
                  <td className="truncate">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
