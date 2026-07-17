import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listPredictionsAdmin,
  voidPredictionAdmin,
  regradePredictionAdmin,
} from "@/lib/admin-dashboard.functions";
import { voidUfcBetAdmin, regradeUfcBetAdmin } from "@/lib/ufc.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Flag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/predictions")({
  component: AdminPredictionsPage,
});

const FOOTBALL_MARKETS = ["result", "correct_score", "total_goals", "btts", "first_scorer", "group_winner", "tournament_winner"];
const UFC_MARKETS = ["moneyline", "three_way", "method", "round", "total_rounds", "distance", "handicap"];
const F1_MARKETS = ["race_winner", "podium_finish", "top_5_finish", "top_10_finish", "fastest_lap", "top_constructor_race", "teammate_h2h", "drivers_champion", "constructors_champion"];
const STATUSES = ["", "pending", "won", "lost", "void"];
const SPORTS = [
  { value: "all", label: "All sports" },
  { value: "football", label: "Football" },
  { value: "ufc", label: "UFC" },
  { value: "f1", label: "Formula 1" },
] as const;
const REGRADE_TARGETS = ["won", "lost", "void", "pending"] as const;

function AdminPredictionsPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const [sport, setSport] = useState<"all" | "football" | "ufc" | "f1">("all");
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [groupByFixture, setGroupByFixture] = useState(true);

  const listFn = useServerFn(listPredictionsAdmin);
  const voidFn = useServerFn(voidPredictionAdmin);
  const regradeFn = useServerFn(regradePredictionAdmin);
  const voidUfcFn = useServerFn(voidUfcBetAdmin);
  const regradeUfcFn = useServerFn(regradeUfcBetAdmin);

  const marketOptions = useMemo(() => {
    if (sport === "football") return ["", ...FOOTBALL_MARKETS];
    if (sport === "ufc") return ["", ...UFC_MARKETS];
    if (sport === "f1") return ["", ...F1_MARKETS];
    return ["", ...FOOTBALL_MARKETS, ...UFC_MARKETS, ...F1_MARKETS];
  }, [sport]);


  const q = useQuery({
    queryKey: ["admin-predictions", sport, market, status],
    queryFn: () => listFn({ data: { sport, market: market || undefined, status: status || undefined } }),
  });

  const voidMut = useMutation({
    mutationFn: async (row: any) =>
      row.sport === "ufc"
        ? voidUfcFn({ data: { betId: row.id, reason } })
        : voidFn({ data: { predictionId: row.id, reason } }),
    onSuccess: () => {
      toast.success("Voided & refunded");
      qc.invalidateQueries({ queryKey: ["admin-predictions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regradeMut = useMutation({
    mutationFn: async (v: { row: any; newStatus: string }) =>
      v.row.sport === "ufc"
        ? regradeUfcFn({ data: { betId: v.row.id, newStatus: v.newStatus as any, reason } })
        : regradeFn({ data: { predictionId: v.row.id, newStatus: v.newStatus as any, reason } }),
    onSuccess: (r: any) => {
      const delta = Number(r?.delta ?? 0);
      toast.success(`Regraded · wallet delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["admin-predictions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (q.data?.predictions ?? []).filter((p: any) => !flaggedOnly || p.flagged_for_review);

  // Group by fixture for the "categorised by fixture" view.
  const groups = useMemo(() => {
    if (!groupByFixture) return null;
    const byFixture = new Map<string, { sport: string; label: string; rows: any[] }>();
    for (const r of filtered) {
      const key = `${r.sport}:${r.fixture_id ?? "unknown"}`;
      const g = byFixture.get(key) ?? { sport: r.sport, label: r.fixture_label ?? "—", rows: [] as any[] };

      g.rows.push(r);
      byFixture.set(key, g);
    }
    return Array.from(byFixture.entries()).map(([key, g]) => ({ key, ...g }));
  }, [filtered, groupByFixture]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Predictions</h1>
        <p className="text-sm text-muted-foreground">
          Unified view of football and UFC bets. Filter by sport, void or regrade with wallet auto-adjustment.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2 flex-wrap">
          <select
            value={sport}
            onChange={(e) => { setSport(e.target.value as any); setMarket(""); }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {marketOptions.map((m) => <option key={m} value={m}>{m || "All markets"}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
          </select>
          <Input
            placeholder="Reason (required to void / regrade)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="md:max-w-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Flagged only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={groupByFixture} onChange={(e) => setGroupByFixture(e.target.checked)} />
            Group by fixture
          </label>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length.toLocaleString()} bets.
        </div>

        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : groupByFixture && groups ? (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded border border-border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                  <div className="flex items-center gap-2">
                    <Badge variant={g.sport === "ufc" ? "default" : "secondary"} className="uppercase text-[10px]">
                      {g.sport}
                    </Badge>
                    <span className="text-sm font-semibold">{g.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{g.rows.length} bets</span>
                </div>
                <div className="overflow-x-auto">
                  <BetsTable
                    rows={g.rows}
                    isViewer={isViewer}
                    reason={reason}
                    voidMut={voidMut}
                    regradeMut={regradeMut}
                    hideFixture
                  />
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">No bets.</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <BetsTable
              rows={filtered}
              isViewer={isViewer}
              reason={reason}
              voidMut={voidMut}
              regradeMut={regradeMut}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function BetsTable({ rows, isViewer, reason, voidMut, regradeMut, hideFixture = false }: {
  rows: any[];
  isViewer: boolean;
  reason: string;
  voidMut: any;
  regradeMut: any;
  hideFixture?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sport</TableHead>
          <TableHead>User</TableHead>
          {!hideFixture && <TableHead>Fixture</TableHead>}
          <TableHead>Market</TableHead>
          <TableHead>Selection</TableHead>
          <TableHead className="text-right">Stake</TableHead>
          <TableHead className="text-right">Odds</TableHead>
          <TableHead className="text-right">Payout</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead>Regrade</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p: any) => {
          const stake = Number(p.virtual_stake);
          const odds = Number(p.reference_odds);
          const payout = stake * odds;
          const flagged = !!p.flagged_for_review;
          return (
            <TableRow key={`${p.sport}:${p.id}`} className={flagged ? "bg-yellow-500/5" : undefined}>
              <TableCell>
                <Badge variant={p.sport === "ufc" ? "default" : "secondary"} className="uppercase text-[10px]">
                  {p.sport}
                </Badge>
              </TableCell>
              <TableCell className="font-medium text-sm">
                <div className="flex items-center gap-1.5">
                  {flagged && <Flag className="h-3 w-3 text-yellow-500 shrink-0" aria-label="Flagged" />}
                  {p.display_name}
                </div>
                {flagged && p.flagged_reason && (
                  <div className="text-[10px] text-yellow-600 mt-0.5 max-w-[200px]" title={p.flagged_reason}>
                    {p.flagged_reason}
                  </div>
                )}
              </TableCell>
              {!hideFixture && <TableCell className="text-xs">{p.fixture_label}</TableCell>}
              <TableCell className="text-xs">{p.market}</TableCell>
              <TableCell className="text-xs">{p.outcome}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{stake.toLocaleString()}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{odds.toFixed(2)}</TableCell>
              <TableCell className="text-right text-xs font-semibold text-primary tabular-nums">
                {payout.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell><Badge variant="outline" className="uppercase text-[10px]">{p.status}</Badge></TableCell>
              <TableCell className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <select
                  className="h-7 rounded border bg-background px-1 text-[11px]"
                  disabled={isViewer || !reason || regradeMut.isPending}
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (v === p.status) { toast.error("Already that status"); e.currentTarget.value = ""; return; }
                    if (!window.confirm(`Regrade this bet ${p.status} → ${v}? Wallet will be adjusted atomically.`)) {
                      e.currentTarget.value = ""; return;
                    }
                    regradeMut.mutate({ row: p, newStatus: v });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">→ …</option>
                  {REGRADE_TARGETS.filter((t) => t !== p.status).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm" variant="outline"
                  disabled={isViewer || p.status !== "pending" || !reason || voidMut.isPending}
                  onClick={() => voidMut.mutate(p)}
                >
                  Void
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {!rows.length && (
          <TableRow><TableCell colSpan={hideFixture ? 11 : 12} className="text-center text-muted-foreground">No bets.</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}
