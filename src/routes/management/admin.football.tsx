import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listFootballFlags,
  adminSyncFootballFixtures,
  adminSyncFootballOdds,
  adminSettleFootball,
  adminSetFootballFlag,
  adminSuspendStaleFootball,
} from "@/features/football/football.functions";
import { ALL_FOOTBALL_COMPETITIONS } from "@/features/football/config/footballCompetitions";

export const Route = createFileRoute("/management/admin/football")({
  head: () => ({ meta: [{ title: "Admin — Football" }] }),
  component: AdminFootballPage,
});

function AdminFootballPage() {
  const qc = useQueryClient();
  const flagsFn = useServerFn(listFootballFlags);
  const setFlag = useServerFn(adminSetFootballFlag);
  const syncFixtures = useServerFn(adminSyncFootballFixtures);
  const syncOdds = useServerFn(adminSyncFootballOdds);
  const settle = useServerFn(adminSettleFootball);
  const suspendStale = useServerFn(adminSuspendStaleFootball);

  const { data: flags } = useQuery({
    queryKey: ["admin-football-flags"],
    queryFn: () => flagsFn(),
  });

  const flagMutation = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => setFlag({ data: v }),
    onSuccess: () => {
      toast.success("Flag updated");
      qc.invalidateQueries({ queryKey: ["admin-football-flags"] });
      qc.invalidateQueries({ queryKey: ["sports-feature-flags"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const runFixtures = useMutation({
    mutationFn: (competition: any) => syncFixtures({ data: { competition } }),
    onSuccess: (r: any) => toast.success(`Synced ${r.fixturesFetched} fixtures (${r.created} new, ${r.updated} updated)`),
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const runOdds = useMutation({
    mutationFn: () => syncOdds(),
    onSuccess: (r: any) => toast.success(`Odds sync: ${r.processed} events processed`),
    onError: (e: any) => toast.error(e?.message ?? "Odds sync failed"),
  });

  const runSettle = useMutation({
    mutationFn: () => settle(),
    onSuccess: (r: any) => toast.success(`Settled ${Array.isArray(r) ? r.length : 0} event(s)`),
    onError: (e: any) => toast.error(e?.message ?? "Settlement failed"),
  });

  const runSuspend = useMutation({
    mutationFn: () => suspendStale(),
    onSuccess: (r: any) => toast.success(`Suspended ${r.suspended} stale market(s)`),
    onError: (e: any) => toast.error(e?.message ?? "Suspension sweep failed"),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Football Admin</h1>
        <p className="text-sm text-muted-foreground">
          Enable competitions, sync fixtures + odds from API-Football, and trigger settlement.
        </p>
      </header>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Feature Flags</h2>
        {ALL_FOOTBALL_COMPETITIONS.map((c) => (
          <div key={c.code} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{c.displayName}</div>
              <div className="text-xs text-muted-foreground">Flag: {c.featureFlagKey}</div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!flags?.[c.featureFlagKey]}
                onChange={(e) => flagMutation.mutate({ key: c.featureFlagKey, enabled: e.target.checked })}
              />
              <span className="text-sm">{flags?.[c.featureFlagKey] ? "Enabled" : "Disabled"}</span>
            </label>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm font-medium">Master football switch</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!flags?.["football_enabled"]}
              onChange={(e) => flagMutation.mutate({ key: "football_enabled", enabled: e.target.checked })}
            />
            <span className="text-sm">{flags?.["football_enabled"] ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Sync fixtures per competition</h2>
        <div className="grid grid-cols-2 gap-2">
          {ALL_FOOTBALL_COMPETITIONS.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={runFixtures.isPending}
              onClick={() => runFixtures.mutate(c.code)}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
            >
              Sync {c.shortName}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Odds & settlement</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={runOdds.isPending}
            onClick={() => runOdds.mutate()}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
          >
            {runOdds.isPending ? "Syncing odds…" : "Sync odds batch"}
          </button>
          <button
            type="button"
            disabled={runSettle.isPending}
            onClick={() => runSettle.mutate()}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
          >
            {runSettle.isPending ? "Settling…" : "Settle finished events"}
          </button>
        </div>
      </section>
          <button
            type="button"
            disabled={runSuspend.isPending}
            onClick={() => {
              if (!confirm("Sweep and suspend stale/ended football markets?")) return;
              runSuspend.mutate();
            }}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
          >
            {runSuspend.isPending ? "Sweeping…" : "Suspend stale markets"}
          </button>
        </div>
      </section>
    </div>
  );
}
