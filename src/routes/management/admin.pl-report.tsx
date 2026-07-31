import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getPlReport, type PlReportInput } from "@/lib/accounting-report.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/management/admin/pl-report")({
  head: () => ({ meta: [{ title: "P/L report — Admin" }] }),
  component: PlReportPage,
});

const PRODUCT_LABELS: Record<string, string> = {
  football: "Football",
  ufc: "UFC / MMA",
  f1: "Formula 1",
  basketball: "Basketball",
  sports_generic: "Generic sports",
  plinko: "Plinko",
  roulette: "Mini Roulette",
  treasure: "Treasure Grid",
  blackjack: "Blackjack",
};

const fmt = (n: unknown) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PlReportPage() {
  const fn = useServerFn(getPlReport);
  const hasSession = useHasSession();

  const [filters, setFilters] = useState<PlReportInput>({
    environment: "PRODUCTION",
    basis: "settlement",
  });
  const [applied, setApplied] = useState<PlReportInput>(filters);

  const q = useQuery({
    queryKey: ["admin-pl-report", applied],
    queryFn: () => withSession(() => fn({ data: applied })),
    enabled: hasSession === true,
    staleTime: 30_000,
  });

  const report: any = (q.data as any)?.report;
  const platform = report?.platform;
  const groups: any[] = report?.groups ?? [];
  const notBacked: string[] = report?.checks?.products_not_yet_journal_backed ?? [];

  const set = (patch: Partial<PlReportInput>) => setFilters((f) => ({ ...f, ...patch }));
  const productOptions = useMemo(
    () => groups.flatMap((g) => (g.products ?? []).map((p: any) => p.product as string)),
    [groups],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Unified P/L report</h1>
          <p className="text-sm text-muted-foreground">
            Built from posted accounting journals. Voids, pushes and pending positions are excluded
            from realised P/L.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => q.refetch()}>
          {q.isFetching ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Environment">
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={filters.environment}
              onChange={(e) => set({ environment: e.target.value as any })}
            >
              <option value="PRODUCTION">Production</option>
              <option value="SIMULATION">Simulation</option>
              <option value="TEST">Test</option>
            </select>
          </Field>
          <Field label="Date basis">
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={filters.basis}
              onChange={(e) => set({ basis: e.target.value as any })}
            >
              <option value="settlement">Settlement date</option>
              <option value="placement">Placement date</option>
            </select>
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => set({ to: e.target.value ? `${e.target.value}T23:59:59Z` : null })}
            />
          </Field>
          <Field label="Sport group">
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={filters.sport ?? ""}
              onChange={(e) => set({ sport: (e.target.value || null) as any })}
            >
              <option value="">All</option>
              <option value="sports">Sports</option>
              <option value="arcade">Arcade</option>
            </select>
          </Field>
          <Field label="Product">
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={filters.products?.[0] ?? ""}
              onChange={(e) => set({ products: e.target.value ? [e.target.value] : null })}
            >
              <option value="">All</option>
              {productOptions.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Game">
            <Input
              placeholder="e.g. plinko"
              value={filters.game ?? ""}
              onChange={(e) => set({ game: e.target.value || null })}
            />
          </Field>
          <Field label="User ID">
            <Input
              placeholder="uuid"
              value={filters.userId ?? ""}
              onChange={(e) => set({ userId: e.target.value || null })}
            />
          </Field>
          <Field label="Config version">
            <Input
              placeholder="any"
              value={filters.configVersion ?? ""}
              onChange={(e) => set({ configVersion: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setApplied(filters)}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const reset: PlReportInput = { environment: "PRODUCTION", basis: "settlement" };
              setFilters(reset);
              setApplied(reset);
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      {q.isLoading ? (
        <Card className="p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      ) : q.error ? (
        <Card className="p-6 text-sm text-destructive">{(q.error as Error).message}</Card>
      ) : !platform ? (
        <Card className="p-6 text-sm text-muted-foreground">No data.</Card>
      ) : (
        <>
          {/* Platform */}
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Entire platform</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Opening bankroll" value={fmt(platform.opening_bankroll)} />
              <Stat label="Closing bankroll" value={fmt(platform.closing_bankroll)} />
              <Stat
                label="Outstanding payouts payable"
                value={fmt(platform.payouts_payable_outstanding)}
              />
              <Stat
                label="Active reserved liability"
                value={fmt(platform.active_reserved_liability)}
              />
              <Stat
                label="Available bankroll"
                value={fmt(platform.available_bankroll)}
                sub={
                  platform.available_bankroll_basis === "live"
                    ? report?.checks?.available_bankroll_matches_authoritative
                      ? "matches placement-capacity check"
                      : "MISMATCH vs placement-capacity check"
                    : `as of ${new Date(platform.pending?.as_of).toLocaleString()}`
                }
              />
              <Stat label="Gross stakes" value={fmt(platform.gross_stakes)} />
              <Stat label="Refunded / void stakes" value={fmt(platform.refunded_stakes)} />
              <Stat label="Net settled stakes" value={fmt(platform.net_settled_stakes)} />
              <Stat label="Gross payouts" value={fmt(platform.gross_payouts)} />
              <Stat label="Refunds" value={fmt(platform.refunds)} />
              <Stat label="Adjustments" value={fmt(platform.adjustments)} />
              <Stat
                label="Realised P/L (by attribution)"
                value={fmt(platform.realised_pl)}
                tone={Number(platform.realised_pl) >= 0 ? "pos" : "neg"}
              />
              <Stat
                label="Hold on net settled stakes"
                value={platform.hold_pct === null ? "—" : `${fmt(platform.hold_pct)}%`}
                sub={
                  platform.gross_hold_pct === null
                    ? undefined
                    : `${fmt(platform.gross_hold_pct)}% on gross stakes`
                }
              />
              <Stat label="Open stakes" value={fmt(platform.pending?.open_stakes)} />
              <Stat
                label="Max potential payout"
                value={fmt(platform.pending?.max_potential_payout)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Available bankroll = closing bankroll − payouts payable − active reserved liability ·{" "}
              {platform.pending?.pending_positions ?? 0} pending position(s) open as of{" "}
              {platform.pending?.as_of ? new Date(platform.pending.as_of).toLocaleString() : "—"}
            </p>
          </Card>

          {/* Reconciliation */}
          {recon && (
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold">Reconciliation</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border p-3 space-y-1 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bankroll by journal posting date
                  </div>
                  <Line label="Opening bankroll" v={recon.bankroll_by_posting_date?.opening_bankroll} />
                  <Line
                    label="+ Actual bankroll movement"
                    v={recon.bankroll_by_posting_date?.physical_bankroll_movement}
                  />
                  <Line
                    label="= Closing bankroll"
                    v={recon.bankroll_by_posting_date?.closing_bankroll}
                    bold
                  />
                  <Flag ok={recon.bankroll_by_posting_date?.identity_ok} label="identity" />
                </div>
                <div className="rounded-lg border p-3 space-y-1 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Timing bridge ({applied.basis === "placement" ? "placement" : "settlement"} basis)
                  </div>
                  <Line
                    label="Realised P/L by reporting attribution"
                    v={recon.timing_bridge?.realised_pl_by_attribution}
                  />
                  <Line
                    label="− Opening-position timing adjustment"
                    v={recon.timing_bridge?.opening_position_timing_adjustment}
                  />
                  <Line
                    label="+ Closing-position timing adjustment"
                    v={recon.timing_bridge?.closing_position_timing_adjustment}
                  />
                  <Line
                    label="+ Out-of-scope house movement"
                    v={recon.timing_bridge?.out_of_scope_house_movement}
                  />
                  <Line
                    label="= Actual bankroll movement"
                    v={recon.timing_bridge?.bridged_bankroll_movement}
                    bold
                  />
                  <Flag ok={recon.timing_bridge?.bridge_ok} label="bridge" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{recon.note}</p>
            </Card>
          )}

          {notBacked.length > 0 && (
            <Card className="p-3 text-xs text-muted-foreground border-amber-500/40">
              Not yet posting to the unified journal (realised figures will read 0 until migrated):{" "}
              {notBacked.map((p) => PRODUCT_LABELS[p] ?? p).join(", ")}.
            </Card>
          )}


          {groups.map((g) => (
            <Card key={g.group} className="p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold capitalize">{g.group}</h2>
                <span className="text-sm">
                  Total P/L:{" "}
                  <span
                    className={
                      Number(g.totals.realised_pl) >= 0 ? "text-emerald-500" : "text-destructive"
                    }
                  >
                    {fmt(g.totals.realised_pl)}
                  </span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-right">
                      <th className="text-left py-1">Product</th>
                      <th>Stakes</th>
                      <th>Gross payouts</th>
                      <th>Refunds</th>
                      <th>Realised P/L</th>
                      <th>Hold %</th>
                      <th>Settled</th>
                      <th>Open stakes</th>
                      <th>Reserved</th>
                      <th>Max payout</th>
                      <th>Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(g.products ?? []).map((p: any) => (
                      <tr key={p.product} className="text-right border-t">
                        <td className="text-left py-1">
                          {PRODUCT_LABELS[p.product] ?? p.product}
                          {!p.journal_backed && (
                            <span className="ml-1 text-[10px] text-amber-500">legacy</span>
                          )}
                        </td>
                        <td>{fmt(p.stakes)}</td>
                        <td>{fmt(p.gross_payouts)}</td>
                        <td>{fmt(p.refunds)}</td>
                        <td
                          className={
                            Number(p.realised_pl) >= 0 ? "text-emerald-500" : "text-destructive"
                          }
                        >
                          {fmt(p.realised_pl)}
                        </td>
                        <td>{p.hold_pct === null ? "—" : `${fmt(p.hold_pct)}%`}</td>
                        <td>{p.settled_positions}</td>
                        <td>{fmt(p.open_stakes)}</td>
                        <td>{fmt(p.reserved_liability)}</td>
                        <td>{fmt(p.max_potential_payout)}</td>
                        <td>{p.pending_positions}</td>
                      </tr>
                    ))}
                    <tr className="text-right border-t font-medium">
                      <td className="text-left py-1">Total {g.group}</td>
                      <td>{fmt(g.totals.stakes)}</td>
                      <td>{fmt(g.totals.gross_payouts)}</td>
                      <td>{fmt(g.totals.refunds)}</td>
                      <td>{fmt(g.totals.realised_pl)}</td>
                      <td>{g.totals.hold_pct === null ? "—" : `${fmt(g.totals.hold_pct)}%`}</td>
                      <td>{g.totals.settled_positions}</td>
                      <td>{fmt(g.totals.open_stakes)}</td>
                      <td>{fmt(g.totals.reserved_liability)}</td>
                      <td>{fmt(g.totals.max_potential_payout)}</td>
                      <td>{g.totals.pending_positions}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <p className="text-xs text-muted-foreground">
            Generated {report.generated_at ? new Date(report.generated_at).toLocaleString() : "—"} ·{" "}
            {applied.basis === "placement" ? "placement-date" : "settlement-date"} view
          </p>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
