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
  adminListRecentSyncRuns,
  adminFootballLiability,
  adminFootballSettlementLog,
  adminFootballSyncErrors,
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
  const recentRunsFn = useServerFn(adminListRecentSyncRuns);
  const liabilityFn = useServerFn(adminFootballLiability);
  const settlementLogFn = useServerFn(adminFootballSettlementLog);
  const syncErrorsFn = useServerFn(adminFootballSyncErrors);

  const { data: flags } = useQuery({
    queryKey: ["admin-football-flags"],
    queryFn: () => flagsFn(),
  });

  const { data: runsData } = useQuery({
    queryKey: ["admin-football-runs"],
    queryFn: () => recentRunsFn(),
    refetchInterval: 15_000,
  });

  const { data: liabilityData } = useQuery({
    queryKey: ["admin-football-liability"],
    queryFn: () => liabilityFn(),
    refetchInterval: 30_000,
  });

  const { data: settlementLog } = useQuery({
    queryKey: ["admin-football-settlement-log"],
    queryFn: () => settlementLogFn(),
    refetchInterval: 30_000,
  });

  const { data: syncErrorsData } = useQuery({
    queryKey: ["admin-football-sync-errors"],
    queryFn: () => syncErrorsFn(),
    refetchInterval: 30_000,
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
        <div className="flex flex-wrap gap-2">
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
            onClick={() => {
              if (!confirm("Settle all finished football events now? This will credit winning payouts.")) return;
              runSettle.mutate();
            }}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
          >
            {runSettle.isPending ? "Settling…" : "Settle finished events"}
          </button>
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

      {/* ---------- LIABILITY ---------- */}
      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Live liability (open bets)</h2>
          {liabilityData?.totals && (
            <div className="text-xs text-muted-foreground">
              {liabilityData.totals.betCount} bets · stake {liabilityData.totals.stake.toFixed(2)} ·
              potential payout {liabilityData.totals.payout.toFixed(2)} ·
              <span className="ml-1 font-semibold text-amber-500">
                exposure {liabilityData.totals.liability.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Event</th>
                <th className="py-1 pr-3">Comp</th>
                <th className="py-1 pr-3">Market</th>
                <th className="py-1 pr-3 text-right">Bets</th>
                <th className="py-1 pr-3 text-right">Stake</th>
                <th className="py-1 pr-3 text-right">Payout</th>
                <th className="py-1 pr-3 text-right">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {(liabilityData?.rows ?? []).map((r: any) => (
                <tr key={`${r.eventId}-${r.marketId}`} className="border-t border-white/5">
                  <td className="py-1 pr-3">
                    {r.event?.name ?? r.eventId.slice(0, 8)}
                  </td>
                  <td className="py-1 pr-3">{r.competition}</td>
                  <td className="py-1 pr-3 font-mono">{r.marketKey}</td>
                  <td className="py-1 pr-3 text-right">{r.betCount}</td>
                  <td className="py-1 pr-3 text-right">{r.totalStake.toFixed(2)}</td>
                  <td className="py-1 pr-3 text-right">{r.totalPotentialPayout.toFixed(2)}</td>
                  <td className="py-1 pr-3 text-right font-semibold text-amber-500">
                    {r.liability.toFixed(2)}
                  </td>
                </tr>
              ))}
              {!liabilityData?.rows?.length && (
                <tr>
                  <td colSpan={7} className="py-2 text-center text-muted-foreground">
                    No open exposure.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- SETTLEMENT LOG ---------- */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Settlement log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Event</th>
                <th className="py-1 pr-3">Score</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Markets</th>
                <th className="py-1 pr-3">Bets</th>
                <th className="py-1 pr-3">Payout</th>
                <th className="py-1 pr-3">Finished</th>
                <th className="py-1 pr-3">By</th>
              </tr>
            </thead>
            <tbody>
              {(settlementLog?.runs ?? []).map((r: any) => {
                const color =
                  r.status === "success"
                    ? "text-emerald-500"
                    : r.status === "partial"
                    ? "text-amber-500"
                    : r.status === "failed"
                    ? "text-red-500"
                    : "text-sky-400";
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-1 pr-3">{r.event?.name ?? r.sports_event_id.slice(0, 8)}</td>
                    <td className="py-1 pr-3">{r.event?.score ?? "—"}</td>
                    <td className={`py-1 pr-3 font-medium ${color}`}>{r.status}</td>
                    <td className="py-1 pr-3">{r.markets_settled}</td>
                    <td className="py-1 pr-3">{r.bets_settled}</td>
                    <td className="py-1 pr-3">{Number(r.total_payout).toFixed(2)}</td>
                    <td className="py-1 pr-3">
                      {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : "—"}
                    </td>
                    <td className="py-1 pr-3">{r.triggered_by ?? "auto"}</td>
                  </tr>
                );
              })}
              {!settlementLog?.runs?.length && (
                <tr>
                  <td colSpan={8} className="py-2 text-center text-muted-foreground">
                    No settlement runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Sync health</h2>
          {runsData?.quota && (
            <div className="text-xs text-muted-foreground">
              API quota today: {runsData.quota.used}
              {runsData.quota.day_limit ? ` / ${runsData.quota.day_limit}` : ""}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Auto-refreshing every 15s. Runs marked "running" for over 5 minutes are treated as stale
          and won't block new jobs.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Job</th>
                <th className="py-1 pr-3">Comp</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Started</th>
                <th className="py-1 pr-3">Duration</th>
                <th className="py-1 pr-3">Fetched</th>
                <th className="py-1 pr-3">New</th>
                <th className="py-1 pr-3">Upd</th>
              </tr>
            </thead>
            <tbody>
              {(runsData?.runs ?? []).slice(0, 15).map((r: any) => {
                const started = new Date(r.started_at);
                const finished = r.finished_at ? new Date(r.finished_at) : null;
                const durMs = finished ? finished.getTime() - started.getTime() : null;
                const color =
                  r.status === "success"
                    ? "text-emerald-500"
                    : r.status === "partial"
                    ? "text-amber-500"
                    : r.status === "failed"
                    ? "text-red-500"
                    : "text-sky-400";
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-1 pr-3">{r.job_type}</td>
                    <td className="py-1 pr-3">{r.competition_code ?? "—"}</td>
                    <td className={`py-1 pr-3 font-medium ${color}`}>{r.status}</td>
                    <td className="py-1 pr-3">{started.toLocaleTimeString()}</td>
                    <td className="py-1 pr-3">
                      {durMs != null ? `${(durMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-1 pr-3">{r.records_fetched ?? "—"}</td>
                    <td className="py-1 pr-3">{r.records_created ?? "—"}</td>
                    <td className="py-1 pr-3">{r.records_updated ?? "—"}</td>
                  </tr>
                );
              })}
              {!runsData?.runs?.length && (
                <tr>
                  <td colSpan={8} className="py-2 text-center text-muted-foreground">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
