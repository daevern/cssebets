import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMatchesForOdds, getMatchPricingBreakdown } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { MARKET_LABELS, selectionLabel } from "@/lib/markets-catalog";
import { BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/management/admin/pricing-breakdown")({
  head: () => ({ meta: [{ title: "Pricing breakdown — Admin" }] }),
  component: PricingBreakdownPage,
});

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const odd = (n: number) => (Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—");

function PricingBreakdownPage() {
  const matchesFn = useServerFn(listMatchesForOdds);
  const breakdownFn = useServerFn(getMatchPricingBreakdown);
  const [selected, setSelected] = useState<string>("");

  const matchesQ = useQuery({
    queryKey: ["admin-pricing-matches"],
    queryFn: () => matchesFn({}),
  });
  const bQ = useQuery({
    queryKey: ["admin-pricing-breakdown", selected],
    queryFn: () => breakdownFn({ data: { matchId: selected } }),
    enabled: !!selected,
    refetchInterval: 30_000,
  });

  const matches = matchesQ.data?.matches ?? [];
  const d = bQ.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          Pricing breakdown
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only. Explains how API odds become CSSEBets odds — overround stripped,
          25% house margin applied, 1.01 floor enforced. Read-only; no logic is changed here.
        </p>
      </div>

      <Card className="p-4">
        <label className="text-xs text-muted-foreground">Match</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 h-9 w-full md:max-w-xl rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a match…</option>
          {matches.map((m: any) => (
            <option key={m.id} value={m.id}>
              {m.home_team} vs {m.away_team} — {new Date(m.kickoff_at).toLocaleString()} [{m.status}]
            </option>
          ))}
        </select>
      </Card>

      {!selected && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Pick a match to inspect its pricing.
        </Card>
      )}

      {selected && bQ.isLoading && (
        <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading breakdown…
        </Card>
      )}

      {selected && bQ.isError && (
        <Card className="p-4 text-sm text-destructive">
          {(bQ.error as Error)?.message ?? "Failed to load breakdown."}
        </Card>
      )}

      {d && (
        <>
          {/* Match meta */}
          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="uppercase">{d.match.status}</Badge>
              <Badge variant={d.match.odds_status && !["fresh", "ok"].includes(String(d.match.odds_status)) ? "destructive" : "secondary"}>
                odds_status: {d.match.odds_status ?? "—"}
              </Badge>
              {d.match.is_simulation && <Badge variant="outline">SIMULATION</Badge>}
              {d.match.manual_override && <Badge variant="destructive">MANUAL OVERRIDE</Badge>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <Meta label="Odds source" value={d.match.odds_source ?? "—"} />
              <Meta label="Last sync" value={d.match.odds_updated_at ? new Date(d.match.odds_updated_at).toLocaleString() : "never"} />
              <Meta label="Suspended markets" value={(d.match.suspended_markets ?? []).join(", ") || "none"} />
              <Meta label="Worst-case exposure" value={`${d.match.liabilities.worst_case.toFixed(2)} / cap ${d.match.liabilities.cap.toFixed(2)}`} />
              <Meta label="Margin applied" value={`${d.pricingConfig.marginPct}% ${d.pricingConfig.applyMarginToReal ? "(active)" : "(disabled)"}`} />
              <Meta label="Min odd floor" value={d.pricingConfig.minOdd.toFixed(2)} />
            </div>
          </Card>

          {/* Warnings */}
          {d.warnings.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-semibold">Warnings</div>
              <div className="space-y-1">
                {d.warnings.map((w: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {w.severity === "error" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    ) : w.severity === "warn" ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-mono mr-2">{w.code}</span>
                      <span className="text-muted-foreground">{w.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 1X2 breakdown */}
          <Card className="p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold">1X2 (Match Result)</div>
              <div className="text-xs text-muted-foreground">model: implied → fair → +{d.pricingConfig.marginPct}% house → floor 1.01</div>
            </div>
            {!d.threeWay ? (
              <p className="text-sm text-destructive">API odds missing — no 1X2 pricing available.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Selection</TableHead>
                      <TableHead className="text-right">API odds</TableHead>
                      <TableHead className="text-right">Raw prob</TableHead>
                      <TableHead className="text-right">Fair prob</TableHead>
                      <TableHead className="text-right">House prob</TableHead>
                      <TableHead className="text-right">CSSEBets odds</TableHead>
                      <TableHead className="text-right">Floor?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(["home", "draw", "away"] as const).map((k) => {
                      const tw = d.threeWay!;
                      return (
                        <TableRow key={k}>
                          <TableCell className="capitalize">{k}</TableCell>
                          <TableCell className="text-right tabular-nums">{odd(tw.api[k])}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{pct(1 / tw.api[k])}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(tw.fair[k])}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(tw.house[k])}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{odd(tw.final[k])}</TableCell>
                          <TableCell className="text-right">
                            {tw.floorApplied[k] ? <Badge variant="destructive">FLOOR</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* Per-market breakdowns */}
          {d.markets.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">No stored derived markets for this match.</Card>
          ) : (
            d.markets.map((m: any) => (
              <Card key={m.market} className="p-4 space-y-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">
                      {(MARKET_LABELS as any)[m.market] ?? m.market}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      market: {m.market} · model: {m.modelType}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    raw Σp: {num(m.rawSum, 4)} · overround: {pct(m.overround)}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Selection</TableHead>
                        <TableHead className="text-right">CSSEBets odds</TableHead>
                        <TableHead className="text-right">Raw prob</TableHead>
                        <TableHead className="text-right">Fair prob</TableHead>
                        <TableHead className="text-right">House prob</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Floor?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {m.selections.map((s: any) => (
                        <TableRow key={s.selection} className={!s.active ? "opacity-60" : ""}>
                          <TableCell>{selectionLabel(s.selection)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{odd(s.odds)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{pct(s.rawImpliedProb)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(s.fairProb)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(s.housedProb)}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.marginAppliedPct}%</TableCell>
                          <TableCell className="text-xs font-mono">
                            {s.source ?? "—"} {s.generated ? <Badge variant="outline" className="ml-1">gen</Badge> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.floorApplied ? <Badge variant="destructive">FLOOR</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {m.otherInfo && (
                  <div className="text-xs rounded border border-dashed p-2 bg-muted/30 space-y-1">
                    <div className="font-semibold">OTHER (residual) calculation</div>
                    <div>Listed fair Σp = {num(m.otherInfo.listedFairSum, 4)} → residual fair p = {num(m.otherInfo.residualFairProb, 4)} = 1 − Σ(listed)</div>
                    <div className="text-muted-foreground">
                      Stored OTHER: odds {odd(m.otherInfo.storedOtherOdds ?? 0)} · raw p {num(m.otherInfo.storedOtherProb ?? 0, 4)}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}

          {/* Operational alerts */}
          {d.alerts.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-semibold">Operational alerts (latest 20)</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Level</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.alerts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant={a.level === "error" || a.level === "critical" ? "destructive" : "secondary"}>{a.level}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{a.category}</TableCell>
                        <TableCell className="text-xs">{a.title}</TableCell>
                        <TableCell className="text-xs">{a.status}</TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
