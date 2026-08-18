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
import {
  MgmtAlert,
  MgmtAlertStack,
  MgmtBtn,
  MgmtField,
  MgmtKpi,
  MgmtPageHeader,
  MgmtPanel,
  MgmtStatus,
  MgmtTable,
  MgmtTd,
  MgmtTh,
  mgmtInputClass,
} from "@/components/management/ops-ui";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useHasSession } from "@/hooks/use-staff-session";

export const Route = createFileRoute("/management/admin/predictions")({
  component: AdminPredictionsPage,
});

const FOOTBALL_MARKETS = [
  "result",
  "correct_score",
  "total_goals",
  "btts",
  "first_scorer",
  "group_winner",
  "tournament_winner",
];
const UFC_MARKETS = ["moneyline", "three_way", "method", "round", "total_rounds", "distance", "handicap"];
const F1_MARKETS = [
  "race_winner",
  "podium_finish",
  "top_5_finish",
  "top_10_finish",
  "fastest_lap",
  "top_constructor_race",
  "teammate_h2h",
  "drivers_champion",
  "constructors_champion",
];
const STATUSES = ["", "pending", "won", "lost", "void"] as const;
const SPORTS = [
  { value: "all", label: "All sports" },
  { value: "football", label: "World Cup / football" },
  { value: "ufc", label: "UFC" },
  { value: "f1", label: "Formula 1" },
] as const;
const REGRADE_TARGETS = ["won", "lost", "void", "pending"] as const;

type Sport = "all" | "football" | "ufc" | "f1";

function fixtureDateKey(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  // Local calendar day for ops review
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateHeading(key: string): string {
  if (key === "unknown") return "No fixture date";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string): "ok" | "warn" | "bad" | "idle" | "info" {
  if (status === "won") return "ok";
  if (status === "pending") return "info";
  if (status === "void") return "warn";
  if (status === "lost") return "idle";
  return "idle";
}

function sportLabel(sport: string): string {
  if (sport === "football") return "Football";
  if (sport === "ufc") return "UFC";
  if (sport === "f1") return "F1";
  return sport;
}

function AdminPredictionsPage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const [sport, setSport] = useState<Sport>("all");
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

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

  const hasSession = useHasSession();
  const q = useQuery({
    queryKey: ["admin-predictions", sport, market, status],
    queryFn: () => listFn({ data: { sport, market: market || undefined, status: status || undefined } }),
    enabled: hasSession === true,
  });

  const voidMut = useMutation({
    mutationFn: async (row: any) => {
      if (row.sport === "f1") throw new Error("F1 void not supported yet");
      return row.sport === "ufc"
        ? voidUfcFn({ data: { betId: row.id, reason } })
        : voidFn({ data: { predictionId: row.id, reason } });
    },
    onSuccess: () => {
      toast.success("Voided & refunded");
      qc.invalidateQueries({ queryKey: ["admin-predictions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regradeMut = useMutation({
    mutationFn: async (v: { row: any; newStatus: string }) => {
      if (v.row.sport === "f1") throw new Error("F1 regrade not supported yet");
      return v.row.sport === "ufc"
        ? regradeUfcFn({ data: { betId: v.row.id, newStatus: v.newStatus as any, reason } })
        : regradeFn({ data: { predictionId: v.row.id, newStatus: v.newStatus as any, reason } });
    },
    onSuccess: (r: any) => {
      const delta = Number(r?.delta ?? 0);
      toast.success(`Regraded · wallet delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["admin-predictions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data?.predictions ?? []).filter((p: any) => {
      if (flaggedOnly && !p.flagged_for_review) return false;
      if (pendingOnly && p.status !== "pending") return false;
      if (!needle) return true;
      const hay = [
        p.display_name,
        p.user_id,
        p.id,
        p.fixture_label,
        p.fixture_id,
        p.market,
        p.outcome,
        p.selection_key,
        p.status,
        p.sport,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [q.data?.predictions, flaggedOnly, pendingOnly, search]);

  const kpis = useMemo(() => {
    let pending = 0;
    let pendingStake = 0;
    let pendingLiability = 0;
    let flagged = 0;
    let voided = 0;
    for (const p of filtered) {
      const stake = Number(p.virtual_stake) || 0;
      const odds = Number(p.reference_odds) || 0;
      if (p.status === "pending") {
        pending += 1;
        pendingStake += stake;
        pendingLiability += stake * odds;
      }
      if (p.flagged_for_review) flagged += 1;
      if (p.status === "void") voided += 1;
    }
    return { pending, pendingStake, pendingLiability, flagged, voided, total: filtered.length };
  }, [filtered]);

  /** Date → fixtures → bets */
  const dateGroups = useMemo(() => {
    type FixtureGroup = {
      key: string;
      sport: string;
      label: string;
      fixtureAt: string | null;
      fixtureStatus: string | null;
      fixtureMeta: string | null;
      rows: any[];
      pendingStake: number;
    };
    type DateGroup = {
      dateKey: string;
      sortAt: number;
      fixtures: FixtureGroup[];
      betCount: number;
      pendingCount: number;
    };

    const byDate = new Map<string, Map<string, FixtureGroup>>();

    for (const r of filtered) {
      const dateKey = fixtureDateKey(r.fixture_at);
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      const fixtures = byDate.get(dateKey)!;
      const fixtureKey = `${r.sport}:${r.fixture_id ?? r.fixture_label ?? "unknown"}`;
      let g = fixtures.get(fixtureKey);
      if (!g) {
        g = {
          key: fixtureKey,
          sport: r.sport,
          label: r.fixture_label ?? "—",
          fixtureAt: r.fixture_at ?? null,
          fixtureStatus: r.fixture_status ?? null,
          fixtureMeta: r.fixture_meta ?? null,
          rows: [],
          pendingStake: 0,
        };
        fixtures.set(fixtureKey, g);
      }
      g.rows.push(r);
      if (r.status === "pending") g.pendingStake += Number(r.virtual_stake) || 0;
    }

    const groups: DateGroup[] = Array.from(byDate.entries()).map(([dateKey, fixturesMap]) => {
      const fixtures = Array.from(fixturesMap.values()).sort((a, b) => {
        const ta = a.fixtureAt ? new Date(a.fixtureAt).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.fixtureAt ? new Date(b.fixtureAt).getTime() : Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return a.label.localeCompare(b.label);
      });
      for (const f of fixtures) {
        f.rows.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      }
      const betCount = fixtures.reduce((n, f) => n + f.rows.length, 0);
      const pendingCount = fixtures.reduce(
        (n, f) => n + f.rows.filter((r) => r.status === "pending").length,
        0,
      );
      const sortAt =
        dateKey === "unknown"
          ? Number.POSITIVE_INFINITY
          : new Date(`${dateKey}T12:00:00`).getTime();
      return { dateKey, sortAt, fixtures, betCount, pendingCount };
    });

    groups.sort((a, b) => a.sortAt - b.sortAt);
    return groups;
  }, [filtered]);

  function isDateOpen(dateKey: string): boolean {
    if (dateKey in expandedDates) return expandedDates[dateKey];
    // Default: expand today + unknown + any date with pending bets
    const today = fixtureDateKey(new Date().toISOString());
    const g = dateGroups.find((d) => d.dateKey === dateKey);
    return dateKey === today || dateKey === "unknown" || (g?.pendingCount ?? 0) > 0;
  }

  return (
    <div className="space-y-6">
      <MgmtPageHeader
        eyebrow="Sportsbook · Audit"
        title="Predictions & bets"
        description="Track every user ticket by fixture date. Void pending bets or regrade settled ones with a required reason (football & UFC). Wallet adjusts automatically."
      />

      <MgmtAlertStack>
        {!reason.trim() ? (
          <MgmtAlert tone="warn" title="Audit reason required">
            Enter a void/regrade reason below before taking action. Reasons are recorded for audit.
          </MgmtAlert>
        ) : null}
        {kpis.flagged > 0 ? (
          <MgmtAlert tone="bad" title={`${kpis.flagged} flagged bet${kpis.flagged === 1 ? "" : "s"}`}>
            Review flagged tickets — filter with “Flagged only”.
          </MgmtAlert>
        ) : null}
      </MgmtAlertStack>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MgmtKpi label="Tickets shown" value={kpis.total.toLocaleString()} />
        <MgmtKpi
          label="Open / pending"
          value={kpis.pending.toLocaleString()}
          tone={kpis.pending > 0 ? "warn" : "neutral"}
          hint="Voidable while pending"
        />
        <MgmtKpi
          label="Pending stake"
          value={kpis.pendingStake.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          hint="Points at risk"
        />
        <MgmtKpi
          label="Gross liability"
          value={kpis.pendingLiability.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          tone="warn"
          hint="Stake × odds if all win"
        />
        <MgmtKpi label="Already voided" value={kpis.voided.toLocaleString()} tone="neutral" />
      </div>

      <MgmtPanel title="Filters & actions" description="Narrow the ledger, then void or regrade from each fixture section.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MgmtField label="Sport">
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value as Sport);
                setMarket("");
              }}
              className={mgmtInputClass}
            >
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </MgmtField>
          <MgmtField label="Market">
            <select value={market} onChange={(e) => setMarket(e.target.value)} className={mgmtInputClass}>
              {marketOptions.map((m) => (
                <option key={m || "all"} value={m}>
                  {m || "All markets"}
                </option>
              ))}
            </select>
          </MgmtField>
          <MgmtField label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={mgmtInputClass}>
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All statuses"}
                </option>
              ))}
            </select>
          </MgmtField>
          <MgmtField label="Search">
            <input
              className={mgmtInputClass}
              placeholder="User, bet ID, fixture, selection…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </MgmtField>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <MgmtField label="Void / regrade reason (required)">
              <input
                className={mgmtInputClass}
                placeholder="e.g. Wrong result posted · customer goodwill · fixture postponed"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </MgmtField>
          </div>
          <div className="flex flex-wrap items-center gap-4 pb-1 text-[12px] text-[var(--mgmt-muted)]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
              Pending only
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
              Flagged only
            </label>
          </div>
        </div>
      </MgmtPanel>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--mgmt-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tickets…
        </div>
      ) : dateGroups.length === 0 ? (
        <MgmtPanel>
          <div className="py-10 text-center text-[13px] text-[var(--mgmt-muted)]">No bets match these filters.</div>
        </MgmtPanel>
      ) : (
        <div className="space-y-4">
          {dateGroups.map((dg) => {
            const open = isDateOpen(dg.dateKey);
            return (
              <MgmtPanel
                key={dg.dateKey}
                flush
                title={formatDateHeading(dg.dateKey)}
                description={`${dg.betCount} ticket${dg.betCount === 1 ? "" : "s"} · ${dg.fixtures.length} fixture${dg.fixtures.length === 1 ? "" : "s"}${dg.pendingCount ? ` · ${dg.pendingCount} pending` : ""}`}
                actions={
                  <MgmtBtn
                    variant="ghost"
                    onClick={() =>
                      setExpandedDates((prev) => ({
                        ...prev,
                        [dg.dateKey]: !open,
                      }))
                    }
                  >
                    {open ? "Collapse" : "Expand"}
                  </MgmtBtn>
                }
              >
                {open ? (
                  <div className="divide-y divide-[var(--mgmt-border)]">
                    {dg.fixtures.map((fx) => (
                      <div key={fx.key} className="bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--mgmt-border)] bg-[#FAFBFC] px-5 py-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <MgmtStatus tone="info">{sportLabel(fx.sport)}</MgmtStatus>
                              {fx.fixtureStatus ? (
                                <MgmtStatus
                                  tone={
                                    fx.fixtureStatus === "live" || fx.fixtureStatus === "in_progress"
                                      ? "warn"
                                      : fx.fixtureStatus === "finished" || fx.fixtureStatus === "completed"
                                        ? "ok"
                                        : "idle"
                                  }
                                >
                                  {fx.fixtureStatus}
                                </MgmtStatus>
                              ) : null}
                              <span className="text-[14px] font-medium text-[var(--mgmt-ink)]">{fx.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--mgmt-muted)]">
                              <span>Kickoff / start: {formatDateTime(fx.fixtureAt)}</span>
                              {fx.fixtureMeta ? <span>{fx.fixtureMeta}</span> : null}
                              <span className="font-mono">{fx.rows[0]?.fixture_id ?? "—"}</span>
                              <span>
                                {fx.rows.length} bet{fx.rows.length === 1 ? "" : "s"}
                                {fx.pendingStake > 0
                                  ? ` · pending stake ${fx.pendingStake.toLocaleString()}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <BetsTable
                          rows={fx.rows}
                          isViewer={isViewer}
                          reason={reason}
                          voidMut={voidMut}
                          regradeMut={regradeMut}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-4 text-[12px] text-[var(--mgmt-muted)]">Collapsed — expand to audit tickets.</div>
                )}
              </MgmtPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BetsTable({
  rows,
  isViewer,
  reason,
  voidMut,
  regradeMut,
}: {
  rows: any[];
  isViewer: boolean;
  reason: string;
  voidMut: any;
  regradeMut: any;
}) {
  return (
    <MgmtTable minWidth="1100px">
      <thead>
        <tr>
          <MgmtTh>User</MgmtTh>
          <MgmtTh>Ticket</MgmtTh>
          <MgmtTh>Market / selection</MgmtTh>
          <MgmtTh className="text-right">Stake</MgmtTh>
          <MgmtTh className="text-right">Odds</MgmtTh>
          <MgmtTh className="text-right">Payout</MgmtTh>
          <MgmtTh>Status</MgmtTh>
          <MgmtTh>Placed / settled</MgmtTh>
          <MgmtTh>Actions</MgmtTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((p: any) => {
          const stake = Number(p.virtual_stake) || 0;
          const odds = Number(p.reference_odds) || 0;
          const payout = Number(p.potential_return) || stake * odds;
          const flagged = !!p.flagged_for_review;
          const canMutate = !isViewer && !!reason.trim() && p.sport !== "f1";
          return (
            <tr key={`${p.sport}:${p.id}`} className={flagged ? "bg-[#FEF7E0]/60" : undefined}>
              <MgmtTd>
                <div className="flex items-center gap-1.5 font-medium">
                  {flagged ? <Flag className="h-3 w-3 shrink-0 text-[#B06000]" aria-label="Flagged" /> : null}
                  {p.display_name}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--mgmt-muted)]">{p.user_id}</div>
                {flagged && p.flagged_reason ? (
                  <div className="mt-1 max-w-[220px] text-[10px] text-[#B06000]" title={p.flagged_reason}>
                    {p.flagged_reason}
                  </div>
                ) : null}
              </MgmtTd>
              <MgmtTd mono>
                <div className="text-[11px]">{p.id}</div>
                <div className="mt-0.5 text-[10px] uppercase text-[var(--mgmt-muted)]">{sportLabel(p.sport)}</div>
              </MgmtTd>
              <MgmtTd>
                <div className="font-medium">{p.market}</div>
                <div className="mt-0.5 text-[12px]">{p.outcome}</div>
                {p.selection_key ? (
                  <div className="mt-0.5 font-mono text-[10px] text-[var(--mgmt-muted)]">{p.selection_key}</div>
                ) : null}
              </MgmtTd>
              <MgmtTd mono className="text-right">
                {stake.toLocaleString()}
              </MgmtTd>
              <MgmtTd mono className="text-right">
                {odds.toFixed(2)}
              </MgmtTd>
              <MgmtTd mono className="text-right font-medium">
                {payout.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </MgmtTd>
              <MgmtTd>
                <MgmtStatus tone={statusTone(p.status)}>{p.status}</MgmtStatus>
              </MgmtTd>
              <MgmtTd>
                <div className="text-[11px]">{formatDateTime(p.created_at)}</div>
                <div className="mt-0.5 text-[10px] text-[var(--mgmt-muted)]">
                  Settled: {formatDateTime(p.settled_at)}
                </div>
              </MgmtTd>
              <MgmtTd>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-[var(--mgmt-border)] bg-white px-2 text-[11px]"
                    disabled={!canMutate || regradeMut.isPending}
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === p.status) {
                        toast.error("Already that status");
                        e.currentTarget.value = "";
                        return;
                      }
                      if (
                        !window.confirm(
                          `Regrade ticket ${p.id.slice(0, 8)}… ${p.status} → ${v}?\nWallet will be adjusted atomically.`,
                        )
                      ) {
                        e.currentTarget.value = "";
                        return;
                      }
                      regradeMut.mutate({ row: p, newStatus: v });
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">Regrade…</option>
                    {REGRADE_TARGETS.filter((t) => t !== p.status).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <MgmtBtn
                    variant="danger"
                    disabled={!canMutate || p.status !== "pending" || voidMut.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Void & refund ticket ${p.id.slice(0, 8)}… for ${p.display_name}?\nStake ${stake.toLocaleString()} will be returned.`,
                        )
                      ) {
                        return;
                      }
                      voidMut.mutate(p);
                    }}
                  >
                    Void
                  </MgmtBtn>
                </div>
                {p.sport === "f1" ? (
                  <div className="mt-1 text-[10px] text-[var(--mgmt-muted)]">F1 void/regrade not available yet</div>
                ) : null}
              </MgmtTd>
            </tr>
          );
        })}
      </tbody>
    </MgmtTable>
  );
}
