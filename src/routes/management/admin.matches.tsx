import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { syncFootballData, settleMatch } from "@/lib/admin.functions";
import { setMatchStatusManual, refreshMatchScore, listMatchesAdmin, setMatchMarginDisabled } from "@/lib/admin-dashboard.functions";
import { resyncStatsAndSettle, manualSettleCardsCorners } from "@/lib/settle-catchup.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useHasSession, withSession } from "@/hooks/use-staff-session";

export const Route = createFileRoute("/management/admin/matches")({
  component: AdminMatchesPage,
});

const STATUSES = ["scheduled", "live", "finished", "cancelled", "postponed"] as const;

function AdminMatchesPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const hasSession = useHasSession();
  const syncFn = useServerFn(syncFootballData);
  const settleFn = useServerFn(settleMatch);
  const statusFn = useServerFn(setMatchStatusManual);
  const refreshFn = useServerFn(refreshMatchScore);
  const listFn = useServerFn(listMatchesAdmin);
  const marginFn = useServerFn(setMatchMarginDisabled);
  const resyncFn = useServerFn(resyncStatsAndSettle);
  const manualFn = useServerFn(manualSettleCardsCorners);

  const matches = useQuery({
    queryKey: ["admin-matches-full"],
    queryFn: async () => {
      const r = await withSession(() => listFn({}));
      return (r?.rows ?? []) as any[];
    },
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (r: any) => {
      if (r.warning) toast.warning(r.warning);
      else toast.success(`Synced ${r.upserted}/${r.total}`);
      qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { matchId: id } }),
    onSuccess: () => { toast.success("Refreshed"); qc.invalidateQueries({ queryKey: ["admin-matches-full"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: any; reason: string }) =>
      statusFn({ data: { matchId: v.id, status: v.status, reason: v.reason } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["admin-matches-full"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const marginMut = useMutation({
    mutationFn: (v: { id: string; disabled: boolean; reason: string }) =>
      marginFn({ data: { matchId: v.id, disabled: v.disabled, reason: v.reason } }),
    onSuccess: (_r, v) => {
      toast.success(v.disabled ? "Margin disabled — odds re-priced at fair value" : "Margin re-enabled — odds re-priced with house margin");
      qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promptReason = (label: string): string | null => {
    const r = typeof window !== "undefined" ? window.prompt(`${label}\n\nEnter a reason (required, min 3 chars):`) : null;
    if (!r || r.trim().length < 3) {
      if (r !== null) toast.error("Reason must be at least 3 characters");
      return null;
    }
    return r.trim();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Matches</h1>
          <p className="text-sm text-muted-foreground">Sync fixtures, refresh scores, settle results.</p>
        </div>
        <Button variant="outline" disabled={isViewer || syncMut.isPending} onClick={() => syncMut.mutate()}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
          Sync football-data
        </Button>
      </div>

      <Card className="p-3 text-xs text-muted-foreground">
        Status changes and margin toggles will prompt you to enter a reason. The reason is recorded in the audit log.
      </Card>

      {matches.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          {(matches.data ?? []).map((m) => (
            <MatchRow
              key={m.id} match={m} canWrite={!isViewer}
              onRefresh={() => refreshMut.mutate(m.id)}
              onStatus={(s) => {
                const reason = promptReason(`Change status of ${m.home_team} vs ${m.away_team} to "${s}"`);
                if (!reason) return;
                statusMut.mutate({ id: m.id, status: s, reason });
              }}
              onToggleMargin={(d) => {
                const reason = promptReason(`${d ? "Disable" : "Re-enable"} margin on ${m.home_team} vs ${m.away_team}`);
                if (!reason) return;
                marginMut.mutate({ id: m.id, disabled: d, reason });
              }}
              onSettle={async (h, a) => {
                try {
                  await settleFn({ data: { matchId: m.id, homeScore: h, awayScore: a } });
                  toast.success("Settled");
                  qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
                } catch (e) { toast.error((e as Error).message); }
              }}
              onResyncCC={async () => {
                try {
                  const r: any = await resyncFn({ data: { matchId: m.id } });
                  toast.success(`Resynced stats — settled ${r.settled} bet(s)`);
                  qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
                } catch (e) { toast.error((e as Error).message); }
              }}
              onManualCC={async (hc, ac, hCards, aCards) => {
                try {
                  const r: any = await manualFn({ data: {
                    matchId: m.id,
                    homeCorners: hc, awayCorners: ac,
                    homeCards: hCards, awayCards: aCards,
                  } });
                  toast.success(`Settled ${r.settled} card/corner bet(s)`);
                  qc.invalidateQueries({ queryKey: ["admin-matches-full"] });
                } catch (e) { toast.error((e as Error).message); }
              }}
            />
          ))}
          {!matches.data?.length && (
            <Card className="p-4 text-center text-muted-foreground text-sm">No matches yet. Sync to load them.</Card>
          )}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match, canWrite, onRefresh, onStatus, onSettle, onToggleMargin, onResyncCC, onManualCC,
}: {
  match: any; canWrite: boolean;
  onRefresh: () => void;
  onStatus: (s: typeof STATUSES[number]) => void;
  onSettle: (h: number, a: number) => void;
  onToggleMargin: (d: boolean) => void;
  onResyncCC: () => void;
  onManualCC: (hc: number | null, ac: number | null, hCards: number | null, aCards: number | null) => void;
}) {
  const [h, setH] = useState(String(match.home_score ?? ""));
  const [a, setA] = useState(String(match.away_score ?? ""));
  const marginOff = Boolean(match.margin_disabled);
  const [ccOpen, setCcOpen] = useState(false);
  const [hc, setHc] = useState(String(match.home_corners ?? ""));
  const [ac, setAc] = useState(String(match.away_corners ?? ""));
  const [hCards, setHCards] = useState(String(match.home_cards ?? ""));
  const [aCards, setACards] = useState(String(match.away_cards ?? ""));

  const parse = (v: string): number | null => {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  };

  const isFinished = match.status === "finished";
  const ccMissing = isFinished && (
    match.home_corners == null || match.away_corners == null ||
    match.home_cards == null || match.away_cards == null
  );

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium truncate">{match.home_team} vs {match.away_team}</div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="uppercase">{match.status}</Badge>
          {marginOff && <Badge variant="destructive" className="uppercase">Margin OFF</Badge>}
          {ccMissing && <Badge variant="destructive" className="uppercase">Stats missing</Badge>}
          <span className="text-muted-foreground">{new Date(match.kickoff_at).toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-14" value={h} onChange={(e) => setH(e.target.value)} placeholder="H" />
        <Input className="w-14" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" />
        <Button size="sm" disabled={!canWrite || h === "" || a === ""} onClick={() => onSettle(Number(h), Number(a))}>
          {isFinished ? "Re-settle" : "Settle"}
        </Button>
        <Button size="sm" variant="outline" disabled={!canWrite} onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
        <select
          className="h-9 rounded-md border bg-background px-2 text-xs"
          value={match.status}
          disabled={!canWrite}
          onChange={(e) => onStatus(e.target.value as any)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button
          size="sm"
          variant={marginOff ? "default" : "outline"}
          disabled={!canWrite}
          title={marginOff ? "Re-enable house margin and re-price odds" : "Disable house margin for this match — publish fair odds"}
          onClick={() => onToggleMargin(!marginOff)}
        >
          {marginOff ? "Re-enable margin" : "Disable margin"}
        </Button>
        {isFinished && (
          <Button size="sm" variant="outline" disabled={!canWrite} onClick={() => setCcOpen((v) => !v)}>
            Cards/Corners
          </Button>
        )}
      </div>
      {ccOpen && isFinished && (
        <div className="border-t pt-2 space-y-2">
          <div className="text-xs font-semibold">Cards / Corners settlement</div>
          <div className="text-[11px] text-muted-foreground">
            Try "Resync stats" first (pulls from API-Football). If the provider has no data,
            enter the final totals manually below and click "Save & settle".
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!canWrite} onClick={onResyncCC}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resync stats & settle
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[11px] space-y-1">
              <span className="text-muted-foreground">Home corners</span>
              <Input value={hc} onChange={(e) => setHc(e.target.value)} placeholder="—" />
            </label>
            <label className="text-[11px] space-y-1">
              <span className="text-muted-foreground">Away corners</span>
              <Input value={ac} onChange={(e) => setAc(e.target.value)} placeholder="—" />
            </label>
            <label className="text-[11px] space-y-1">
              <span className="text-muted-foreground">Home cards (Y+R)</span>
              <Input value={hCards} onChange={(e) => setHCards(e.target.value)} placeholder="—" />
            </label>
            <label className="text-[11px] space-y-1">
              <span className="text-muted-foreground">Away cards (Y+R)</span>
              <Input value={aCards} onChange={(e) => setACards(e.target.value)} placeholder="—" />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={() => onManualCC(parse(hc), parse(ac), parse(hCards), parse(aCards))}
            >
              Save & settle
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
