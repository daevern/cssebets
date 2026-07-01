import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminRiskOverview,
  getMatchScenarioBreakdown,
  recalculateMatchExposure,
  recalculateAllStaleMatches,
} from "@/lib/admin-risk-overview.functions";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Banknote,
  ScrollText,
  BookOpen,
  Activity,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/management/admin/")({
  head: () => ({ meta: [{ title: "Risk overview — cssebets admin" }] }),
  component: AdminOverview,
});

const fmt = (n: number | null | undefined, digits = 2) => {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
const pct = (n: number | null | undefined) => {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
};

const RISK_STYLES: Record<string, string> = {
  safe: "text-emerald-300 border-emerald-500/40",
  medium: "text-yellow-300 border-yellow-500/40",
  high: "text-orange-300 border-orange-500/40",
  critical: "text-red-300 border-red-500/50 bg-red-500/5",
};

function AdminOverview() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getAdminRiskOverview);
  const bulkFn = useServerFn(recalculateAllStaleMatches);
  const singleFn = useServerFn(recalculateMatchExposure);

  const q = useQuery({
    queryKey: ["admin-risk-overview"],
    queryFn: () => overviewFn({}),
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-risk-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-scenarios"] });
  };

  const bulk = useMutation({
    mutationFn: () => bulkFn({}),
    onSuccess: (res) => {
      toast.success(
        `Recalculated ${res.summary.total} matches — scenarios ok ${res.summary.scenarioOk}/${res.summary.total}`,
      );
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const single = useMutation({
    mutationFn: (matchId: string) => singleFn({ data: { matchId, includeCorrelated: true } }),
    onSuccess: (res) => {
      const s = res.results.scenario?.ok ? "ok" : "fail";
      const c = res.results.correlated?.ok ? "ok" : "fail";
      toast.success(`Recalculated — scenario ${s} · correlated ${c}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading risk overview…
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="border border-red-500/40 bg-red-500/5 p-4 text-[12px] text-red-300">
        {(q.error as Error)?.message ?? "Failed to load overview."}
      </div>
    );
  }

  const d = q.data;
  const shortfall = d.risk.bankrollShortfall > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-[var(--color-surface-border)] pb-3">
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink)]">
            Risk overview
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)] mt-0.5">
            Phase 12 · live bankroll · scenario exposure · correlated alerts · maker-checker
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          <span>updated {new Date(d.generatedAt).toLocaleTimeString()}</span>
          <button
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-1 border border-[var(--color-surface-border)] px-2 py-1 hover:text-[var(--color-neon)]"
          >
            <RefreshCw className="h-3 w-3" /> refresh
          </button>
        </div>
      </header>

      {/* 1. Risk overview KPIs */}
      <Section title="Risk overview" icon={ShieldAlert}>
        {!d.bankroll.available && (
          <div className="border border-red-500/40 bg-red-500/5 p-3 text-[11px] text-red-300 mb-3">
            Live bankroll (platform_bankroll id=1, kind=live, is_active=true) not configured.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KPI label="Live bankroll" value={fmt(d.bankroll.balance)} tone="neon" />
          <KPI label="Pending stake" value={fmt(d.risk.pendingStake)} />
          <KPI label="Open gross exposure" value={fmt(d.risk.openGrossExposure)} />
          <KPI label="Open net liability" value={fmt(d.risk.openNetLiability)} />
          <KPI label="Worst-case gross payout" value={fmt(d.risk.worstCaseGrossPayout)} />
          <KPI
            label="Worst-case net liability"
            value={fmt(d.risk.worstCaseNetLiability)}
            tone={shortfall ? "danger" : undefined}
          />
          <KPI
            label="Bankroll coverage"
            value={
              d.risk.bankrollCoverageRatio == null
                ? "∞"
                : `${d.risk.bankrollCoverageRatio.toFixed(2)}×`
            }
            tone={shortfall ? "danger" : "ok"}
          />
          <KPI
            label="Shortfall"
            value={fmt(d.risk.bankrollShortfall)}
            tone={shortfall ? "danger" : "muted"}
          />
          <KPI
            label="Stale exposure matches"
            value={String(d.risk.staleMatchCount)}
            tone={d.risk.staleMatchCount > 0 ? "warn" : "muted"}
          />
          <KPI
            label="Open correlated alerts"
            value={String(d.risk.openCorrelatedAlertCount)}
            tone={d.risk.openCorrelatedAlertCount > 0 ? "warn" : "muted"}
          />
          <KPI
            label="Critical/high alerts"
            value={String(d.risk.criticalHighAlertCount)}
            tone={d.risk.criticalHighAlertCount > 0 ? "danger" : "muted"}
          />
        </div>
        <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          bankroll source: platform_bankroll id=1 · kind=live · is_active=true · updated{" "}
          {d.bankroll.updatedAt ? new Date(d.bankroll.updatedAt).toLocaleString() : "—"}
        </p>
      </Section>

      {/* 2. Stale exposure controls */}
      <Section title="Stale exposure controls" icon={RefreshCw}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-[11px] text-[var(--color-ink-muted)]">
            {d.staleMatches.length} stale match{d.staleMatches.length === 1 ? "" : "es"} with pending bets
          </span>
          <button
            disabled={bulk.isPending || d.staleMatches.length === 0}
            onClick={() => bulk.mutate()}
            className="inline-flex items-center gap-1.5 border border-[var(--color-neon)] bg-[var(--color-neon)] text-[var(--color-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] disabled:opacity-40"
          >
            {bulk.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recalculate all stale
          </button>
        </div>
        {d.staleMatches.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-muted)] border border-dashed border-[var(--color-surface-border)] p-3">
            All match exposures are fresh.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)] border-b border-dashed border-[var(--color-surface-border)]">
                <tr>
                  <Th>Match</Th>
                  <Th>Kickoff</Th>
                  <Th align="right">Pending bets</Th>
                  <Th align="right">Pending stake</Th>
                  <Th>Last calc</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {d.staleMatches.map((m) => (
                  <tr key={m.matchId} className="border-b border-dashed border-[var(--color-surface-border)]/50">
                    <Td className="font-medium">{m.match}</Td>
                    <Td className="text-[10px] text-[var(--color-ink-muted)]">
                      {m.kickoffAt ? new Date(m.kickoffAt).toLocaleString() : "—"}
                    </Td>
                    <Td align="right">{m.pendingBetCount}</Td>
                    <Td align="right">{fmt(m.pendingStake)}</Td>
                    <Td className="text-[10px] text-[var(--color-ink-muted)]">
                      {m.lastCalculatedAt ? new Date(m.lastCalculatedAt).toLocaleString() : "—"}
                    </Td>
                    <Td align="right">
                      <button
                        disabled={single.isPending}
                        onClick={() => single.mutate(m.matchId)}
                        className="text-[9px] font-bold uppercase tracking-[0.22em] border border-[var(--color-surface-border)] px-2 py-1 hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] disabled:opacity-40"
                      >
                        Recalc
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 3. Worst-case exposure per match */}
      <Section title="Match worst-case exposure" icon={TrendingDown}>
        {d.exposureRows.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-muted)]">No pending bets.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)] border-b border-dashed border-[var(--color-surface-border)]">
                <tr>
                  <Th>Match</Th>
                  <Th align="right">Bets</Th>
                  <Th align="right">Stake</Th>
                  <Th>Worst scenario</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Net liab.</Th>
                  <Th>Risk</Th>
                  <Th>Stale</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {d.exposureRows.map((r) => (
                  <ExposureMatchRow
                    key={r.matchId}
                    row={r}
                    onRecalc={() => single.mutate(r.matchId)}
                    busy={single.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 4. Correlated alerts link (detail lives on dedicated page) */}
      <Section title="Correlated risk alerts" icon={AlertTriangle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 flex-1">
            <KPI label="Open alerts" value={String(d.risk.openCorrelatedAlertCount)} />
            <KPI
              label="Critical / high"
              value={String(d.risk.criticalHighAlertCount)}
              tone={d.risk.criticalHighAlertCount > 0 ? "danger" : "muted"}
            />
            <KPI
              label="Stale matches"
              value={String(d.risk.staleMatchCount)}
              tone={d.risk.staleMatchCount > 0 ? "warn" : "muted"}
            />
          </div>
          <Link
            to="/management/admin/correlated-risk"
            className="inline-flex items-center gap-1.5 border border-[var(--color-neon)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:bg-[var(--color-neon)] hover:text-[var(--color-surface)]"
          >
            Open alerts board
          </Link>
        </div>
      </Section>

      {/* 5. P&L */}
      <Section title="P&L (settlement-based)" icon={TrendingUp}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KPI label="Total stake accepted" value={fmt(d.pnl.totalStakeAccepted)} />
          <KPI label="Settled stake" value={fmt(d.pnl.settledStake)} />
          <KPI label="Pending stake" value={fmt(d.pnl.pendingStake)} />
          <KPI label="Gross winning payouts" value={fmt(d.pnl.grossWinningPayouts)} />
          <KPI label="Void / refund amount" value={fmt(d.pnl.voidRefundAmount)} />
          <KPI
            label="House P&L"
            value={fmt(d.pnl.housePnL)}
            tone={d.pnl.housePnL >= 0 ? "ok" : "danger"}
          />
          <KPI label="Open gross exposure" value={fmt(d.pnl.openGrossExposure)} />
          <KPI label="Open net liability" value={fmt(d.pnl.openNetLiability)} />
        </div>
        <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          derived only from predictions (virtual_stake / gross_payout / house_profit_loss / status).
          Deposits, admin credits, bonuses, point-request approvals and manual corrections are
          excluded from betting P&L.
        </p>

        <div className="mt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)] mb-2">
            Wallet movement (separate ledger)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <KPI label="Deposits / point approvals" value={fmt(d.walletBuckets.deposits_point_approvals)} />
            <KPI label="Withdrawals / payouts" value={fmt(d.walletBuckets.withdrawals_payouts)} />
            <KPI label="Admin credits" value={fmt(d.walletBuckets.admin_credits)} />
            <KPI label="Admin debits" value={fmt(d.walletBuckets.admin_debits)} />
            <KPI label="Bonuses / corrections" value={fmt(d.walletBuckets.bonuses_corrections)} />
            <KPI label="Uncategorized" value={fmt(d.walletBuckets.uncategorized)} tone="muted" />
          </div>
        </div>
      </Section>

      {/* 6. Maker-checker finance panel */}
      <Section title="Maker-checker · finance" icon={Banknote}>
        <div className={cn(
          "mb-3 border p-2 text-[11px]",
          d.makerChecker.allowSelfApproval
            ? "border-yellow-500/50 bg-yellow-500/5 text-yellow-200"
            : "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
        )}>
          {d.makerChecker.allowSelfApproval
            ? "⚠ Single-admin self-approval is enabled. Financial actions can be approved by the same admin and will be audit logged."
            : "Dual-admin approval required for sensitive financial actions."}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KPI label="Pending payouts" value={String(d.makerChecker.pendingPayouts)} tone={d.makerChecker.pendingPayouts > 0 ? "warn" : "muted"} />
          <KPI label="Approved · not completed" value={String(d.makerChecker.approvedNotCompletedPayouts)} tone={d.makerChecker.approvedNotCompletedPayouts > 0 ? "warn" : "muted"} />
          <KPI label="Pending adjustments" value={String(d.makerChecker.pendingWalletAdjustments)} tone={d.makerChecker.pendingWalletAdjustments > 0 ? "warn" : "muted"} />
          <KPI label="Rejected adjustments" value={String(d.makerChecker.rejectedWalletAdjustments)} tone="muted" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <NavCard to="/management/admin/payouts" label="Payout approvals" icon={Banknote} />
          <NavCard to="/management/admin/wallet-adjustments" label="Wallet adjustment requests" icon={Wallet} />
          <NavCard to="/management/admin/audit" label="Audit log" icon={ScrollText} />
        </div>
      </Section>

      {/* 7. Audit activity */}
      <Section title="Recent audit activity" icon={ScrollText}>
        {d.auditRecent.length === 0 ? (
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            No recent sensitive actions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)] border-b border-dashed border-[var(--color-surface-border)]">
                <tr>
                  <Th>Time</Th>
                  <Th>Action</Th>
                  <Th>Actor</Th>
                  <Th>Target user</Th>
                  <Th>Entity</Th>
                  <Th>Summary</Th>
                </tr>
              </thead>
              <tbody>
                {d.auditRecent.map((r) => (
                  <tr key={r.id} className="border-b border-dashed border-[var(--color-surface-border)]/40">
                    <Td className="text-[10px] text-[var(--color-ink-muted)]">
                      {new Date(r.createdAt).toLocaleString()}
                    </Td>
                    <Td className="font-mono text-[10px] text-[var(--color-neon)]">{r.action}</Td>
                    <Td className="font-mono text-[10px]">{r.actorId?.slice(0, 8) ?? "—"}</Td>
                    <Td className="font-mono text-[10px]">{r.targetUserId?.slice(0, 8) ?? "—"}</Td>
                    <Td className="text-[10px] text-[var(--color-ink-muted)]">
                      {r.entity ?? "—"}
                      {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
                    </Td>
                    <Td className="text-[10px]">{r.summary || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Link
            to="/management/admin/audit"
            className="inline-flex items-center gap-1.5 border border-[var(--color-surface-border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
          >
            View full audit log
          </Link>
        </div>
      </Section>

      {/* 8. Market rules */}
      <Section title="Market rules" icon={BookOpen}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Active markets" value={String(d.marketRules.active)} tone="ok" />
            <KPI label="Inactive markets" value={String(d.marketRules.inactive)} tone="muted" />
          </div>
          <Link
            to="/management/admin/market-rules"
            className="inline-flex items-center gap-1.5 border border-[var(--color-neon)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)] hover:bg-[var(--color-neon)] hover:text-[var(--color-surface)]"
          >
            Open market rules
          </Link>
        </div>
      </Section>

      <p className="text-[9px] text-[var(--color-ink-muted)] uppercase tracking-[0.2em] border-t border-dashed border-[var(--color-surface-border)] pt-3">
        Phase 12 · UI-only consolidation. Settlement, wallet balances, prediction statuses, odds,
        scenario formulas, correlated formulas, payout & wallet-adjustment business logic, and
        historical accounting were not changed.
      </p>
    </div>
  );
}

// ---------- Sub-components ----------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3 md:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-[var(--color-neon)]" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.26em] text-[var(--color-ink)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "neon" | "danger" | "warn" | "ok" | "muted";
}) {
  const toneCls =
    tone === "neon"
      ? "text-[var(--color-neon)]"
      : tone === "danger"
        ? "text-red-300"
        : tone === "warn"
          ? "text-yellow-300"
          : tone === "ok"
            ? "text-emerald-300"
            : tone === "muted"
              ? "text-[var(--color-ink-muted)]"
              : "text-[var(--color-ink)]";
  return (
    <div className="border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-2.5 py-2">
      <div className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-[15px] tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" | "left" }) {
  return (
    <th
      className={cn(
        "px-2 py-1.5 font-bold",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right" | "left";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-2 py-1.5 align-top",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

function NavCard({ to, label, icon: Icon }: { to: string; label: string; icon: any }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)] hover:border-[var(--color-neon)]"
    >
      <Icon className="h-3 w-3" /> {label}
    </Link>
  );
}

// Expandable exposure row → shows scenario breakdown on click
function ExposureMatchRow({
  row,
  onRecalc,
  busy,
}: {
  row: {
    matchId: string;
    match: string;
    kickoffAt: string | null;
    pendingBetCount: number;
    pendingStake: number;
    worstScenarioKey: string | null;
    worstScenarioLabel: string | null;
    worstGrossPayout: number;
    worstNetLiability: number;
    exposureStale: boolean;
    lastCalculatedAt: string | null;
    riskLevel: "safe" | "medium" | "high" | "critical";
  };
  onRecalc: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scenarioFn = useServerFn(getMatchScenarioBreakdown);
  const scenarioQ = useQuery({
    queryKey: ["admin-scenarios", row.matchId],
    queryFn: () => scenarioFn({ data: { matchId: row.matchId } }),
    enabled: open,
  });

  return (
    <>
      <tr className="border-b border-dashed border-[var(--color-surface-border)]/40">
        <Td>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-left font-medium hover:text-[var(--color-neon)]"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {row.match}
          </button>
          <div className="text-[9px] text-[var(--color-ink-muted)] mt-0.5">
            {row.kickoffAt ? new Date(row.kickoffAt).toLocaleString() : "—"}
          </div>
        </Td>
        <Td align="right">{row.pendingBetCount}</Td>
        <Td align="right">{fmt(row.pendingStake)}</Td>
        <Td className="text-[10px] font-mono">
          {row.worstScenarioLabel ?? <span className="text-[var(--color-ink-muted)]">—</span>}
        </Td>
        <Td align="right">{fmt(row.worstGrossPayout)}</Td>
        <Td align="right" className="font-semibold">{fmt(row.worstNetLiability)}</Td>
        <Td>
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-[0.22em] px-1.5 py-0.5 border",
            RISK_STYLES[row.riskLevel],
          )}>
            {row.riskLevel}
          </span>
        </Td>
        <Td>
          {row.exposureStale ? (
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-yellow-300">stale</span>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-300">fresh</span>
          )}
          <div className="text-[9px] text-[var(--color-ink-muted)]">
            {row.lastCalculatedAt ? new Date(row.lastCalculatedAt).toLocaleString() : "—"}
          </div>
        </Td>
        <Td align="right">
          <button
            disabled={busy}
            onClick={onRecalc}
            className="text-[9px] font-bold uppercase tracking-[0.22em] border border-[var(--color-surface-border)] px-2 py-1 hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] disabled:opacity-40"
          >
            Recalc
          </button>
        </Td>
      </tr>
      {open && (
        <tr className="bg-[var(--color-surface)]/50">
          <td colSpan={9} className="p-3">
            {scenarioQ.isLoading ? (
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-ink-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading scenarios…
              </div>
            ) : scenarioQ.data && scenarioQ.data.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead className="text-[8.5px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                    <tr>
                      <Th>Scenario</Th>
                      <Th align="right">Gross</Th>
                      <Th align="right">Net liab.</Th>
                      <Th align="right">Stake involved</Th>
                      <Th align="right">Winning bets</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioQ.data.rows.map((s: any) => (
                      <tr key={s.scenario_key} className="border-b border-dashed border-[var(--color-surface-border)]/30">
                        <Td className="font-mono">{s.scenario_label}</Td>
                        <Td align="right">{fmt(s.gross_payout)}</Td>
                        <Td align="right">{fmt(s.net_liability)}</Td>
                        <Td align="right">{fmt(s.total_stake_involved)}</Td>
                        <Td align="right">{s.winning_bet_count}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[10px] text-[var(--color-ink-muted)]">
                No scenario rows yet. Trigger a recalculation.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
