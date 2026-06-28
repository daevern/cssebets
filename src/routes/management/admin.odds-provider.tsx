import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Database, Activity } from "lucide-react";
import {
  getApiFootballStatus,
  triggerApiFootballSync,
} from "@/lib/apifootball.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/odds-provider")({
  component: ApiFootballPage,
});

function ApiFootballPage() {
  const statusFn = useServerFn(getApiFootballStatus);
  const syncFn = useServerFn(triggerApiFootballSync);
  const [hours, setHours] = useState(48);
  const [maxMatches, setMaxMatches] = useState(10);

  const statusQ = useQuery({
    queryKey: ["apifootball-status"],
    queryFn: () => statusFn({}),
    refetchInterval: 30_000,
  });

  const syncM = useMutation({
    mutationFn: () => syncFn({ data: { hoursAhead: hours, maxMatches } }),
    onSuccess: (r: any) => {
      const ok = (r?.results ?? []).filter((x: any) => x.status === "ok").length;
      toast.success(`Synced ${ok}/${r?.processed ?? 0} matches`);
      statusQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const s = statusQ.data;
  const quota = s?.quota;
  const usedPct = quota ? Math.round((quota.used / Math.max(quota.day_limit, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API-Football provider</h1>
          <p className="text-sm text-muted-foreground">
            Pull real bookmaker prices into match_market_odds. Quota resets daily (UTC).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={s?.keyConfigured ? "default" : "destructive"}>
            {s?.keyConfigured ? "Key configured" : "Missing API_FOOTBALL_KEY"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => statusQ.refetch()}>
            <RefreshCw className="size-4 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Daily quota</div>
          <div className="mt-1 text-2xl font-mono">
            {quota?.used ?? 0} / {quota?.day_limit ?? 100}
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {quota ? `${quota.remaining} requests remaining today` : "—"}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Database className="size-3.5" /> Linked fixtures
          </div>
          <div className="mt-1 text-2xl font-mono">{s?.linkedMatches ?? 0}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Matches with a resolved API-Football fixture id (no longer cost quota to re-link).
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Activity className="size-3.5" /> Markets from provider
          </div>
          <div className="mt-1 text-2xl font-mono">{s?.marketsFromProvider ?? 0}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Rows in match_market_odds sourced from api-football (vs. seeded/fabricated).
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="font-semibold">Sync now</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Hours ahead</span>
            <input
              type="number"
              min={1}
              max={168}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-1 block w-full rounded border bg-background px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Max matches per run</span>
            <input
              type="number"
              min={1}
              max={40}
              value={maxMatches}
              onChange={(e) => setMaxMatches(Number(e.target.value))}
              className="mt-1 block w-full rounded border bg-background px-2 py-1"
            />
          </label>
          <div className="flex items-end">
            <Button
              onClick={() => syncM.mutate()}
              disabled={syncM.isPending || !s?.keyConfigured || (quota?.remaining ?? 0) <= 1}
              className="w-full"
            >
              {syncM.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="size-4 mr-1.5" />
              )}
              Run sync
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each match costs 1 quota request (plus 1 the first time to resolve its fixture id).
          The sync skips matches already refreshed within the last 6 hours.
        </p>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-3">Recent payloads</div>
        {statusQ.isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (s?.recent?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">No sync runs yet.</div>
        ) : (
          <div className="text-xs font-mono space-y-1">
            {s!.recent.map((r: any) => (
              <div key={r.fetched_at + r.fixture_id} className="flex justify-between border-b border-border/40 pb-1">
                <span>fixture #{r.fixture_id}</span>
                <span className="text-muted-foreground">
                  {r.bookmaker_count} bookmakers · {new Date(r.fetched_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {syncM.data && (
        <Card className="p-4">
          <div className="font-semibold mb-2">Last run</div>
          <pre className="text-xs overflow-auto bg-muted/30 p-3 rounded">
            {JSON.stringify(syncM.data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
