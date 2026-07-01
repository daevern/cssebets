import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_TIERS = ["admin", "super_admin", "viewer"] as const;
const WRITE_TIERS = ["admin", "super_admin"] as const;

async function requireTier(supabase: any, userId: string, tiers: readonly string[] = ADMIN_TIERS) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => tiers.includes(r as any))) throw new Error("Forbidden");
}

// ==============================================================
// Phase 12: Admin overview aggregator
// Read-only. No settlement / wallet / prediction / odds mutations.
// ==============================================================

type MatchExposureRow = {
  matchId: string;
  match: string;
  kickoffAt: string | null;
  status: string;
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

export const getAdminRiskOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Canonical bankroll: platform_bankroll id=1 live active
    const { data: bankrollRow } = await (supabaseAdmin as any)
      .from("platform_bankroll")
      .select("balance, total_stakes_collected, total_payouts_paid, updated_at, kind, is_active")
      .eq("id", 1)
      .eq("kind", "live")
      .eq("is_active", true)
      .maybeSingle();
    const bankroll = Number(bankrollRow?.balance ?? 0);
    const bankrollUpdatedAt = bankrollRow?.updated_at ?? null;

    const [
      { data: preds },
      { data: matchRows },
      { data: scenarios },
      { data: alertsRaw },
      { data: settingsRow },
      { data: payoutStatuses },
      { data: walletAdjStatuses },
      { data: marketRules },
      { data: recentAudit },
      { data: walletTxns },
    ] = await Promise.all([
      supabaseAdmin
        .from("predictions")
        .select("id, match_id, user_id, virtual_stake, potential_return, gross_payout, house_profit_loss, status")
        .eq("is_simulation" as any, false),
      supabaseAdmin
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, status, exposure_is_stale, exposure_last_calculated_at, is_simulation")
        .eq("is_simulation" as any, false),
      supabaseAdmin
        .from("match_exposure_scenarios")
        .select("match_id, scenario_key, scenario_label, gross_payout, net_liability, calculated_at"),
      supabaseAdmin
        .from("correlated_exposure_alerts")
        .select("id, severity, status")
        .in("status", ["open", "stale"]),
      (supabaseAdmin as any)
        .from("platform_settings")
        .select("allow_single_admin_self_approval")
        .eq("id", 1)
        .maybeSingle(),
      supabaseAdmin
        .from("payout_requests")
        .select("id, status"),
      (supabaseAdmin as any)
        .from("wallet_adjustment_requests")
        .select("id, status"),
      (supabaseAdmin as any)
        .from("market_rules")
        .select("is_active"),
      supabaseAdmin
        .from("audit_log")
        .select("id, created_at, action, entity, entity_id, user_id, target_user_id, metadata, reason")
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("wallet_transactions")
        .select("amount, type, transaction_category"),
    ]);

    const predsList = preds ?? [];
    const matchById = new Map<string, any>();
    for (const m of matchRows ?? []) matchById.set(m.id, m);

    // Group predictions by match (pending only for exposure table)
    const pendingByMatch = new Map<string, any[]>();
    for (const p of predsList) {
      if (p.status !== "pending" || !p.match_id) continue;
      const arr = pendingByMatch.get(p.match_id) ?? [];
      arr.push(p);
      pendingByMatch.set(p.match_id, arr);
    }

    // Group worst scenario per match
    const worstScenarioByMatch = new Map<string, any>();
    const scenariosByMatch = new Map<string, any[]>();
    for (const s of scenarios ?? []) {
      const arr = scenariosByMatch.get(s.match_id) ?? [];
      arr.push(s);
      scenariosByMatch.set(s.match_id, arr);
      const cur = worstScenarioByMatch.get(s.match_id);
      if (!cur || Number(s.net_liability) > Number(cur.net_liability)) {
        worstScenarioByMatch.set(s.match_id, s);
      }
    }

    // P&L (settlement-based only)
    let totalStakeAccepted = 0;
    let settledStake = 0;
    let pendingStake = 0;
    let grossWinningPayouts = 0;
    let voidRefundAmount = 0;
    let openGrossExposure = 0;
    let housePnL = 0;
    for (const p of predsList) {
      const stake = Number(p.virtual_stake || 0);
      totalStakeAccepted += stake;
      if (p.status === "won") {
        settledStake += stake;
        grossWinningPayouts += Number(p.gross_payout || 0);
        housePnL += Number(p.house_profit_loss || 0);
      } else if (p.status === "lost") {
        settledStake += stake;
        housePnL += Number(p.house_profit_loss || 0);
      } else if (p.status === "void") {
        voidRefundAmount += Number(p.gross_payout || p.virtual_stake || 0);
      } else if (p.status === "pending") {
        pendingStake += stake;
        openGrossExposure += Number(p.potential_return || 0);
      }
    }
    const openNetLiability = Math.max(0, openGrossExposure - pendingStake);

    // Worst-case exposure sums
    let worstCaseGrossPayout = 0;
    let worstCaseNetLiability = 0;
    for (const w of worstScenarioByMatch.values()) {
      worstCaseGrossPayout += Number(w.gross_payout || 0);
      worstCaseNetLiability += Number(w.net_liability || 0);
    }

    // Coverage ratios
    const bankrollCoverageRatio =
      worstCaseNetLiability > 0 ? bankroll / worstCaseNetLiability : null;
    const bankrollShortfall = Math.max(0, worstCaseNetLiability - bankroll);

    // Exposure table rows
    const riskLevelFor = (net: number): MatchExposureRow["riskLevel"] => {
      if (bankroll <= 0) return "critical";
      const pct = net / bankroll;
      if (pct >= 0.20) return "critical";
      if (pct >= 0.10) return "high";
      if (pct >= 0.05) return "medium";
      return "safe";
    };

    const exposureRows: MatchExposureRow[] = [];
    let staleMatchCount = 0;
    for (const [matchId, betList] of pendingByMatch.entries()) {
      const m = matchById.get(matchId);
      if (!m) continue;
      const worst = worstScenarioByMatch.get(matchId);
      const netLiab = Number(worst?.net_liability ?? 0);
      const pendingStakeForMatch = betList.reduce(
        (s: number, p: any) => s + Number(p.virtual_stake || 0),
        0,
      );
      const isStale = !!m.exposure_is_stale;
      if (isStale) staleMatchCount += 1;
      exposureRows.push({
        matchId,
        match: `${m.home_team} vs ${m.away_team}`,
        kickoffAt: m.kickoff_at,
        status: m.status,
        pendingBetCount: betList.length,
        pendingStake: pendingStakeForMatch,
        worstScenarioKey: worst?.scenario_key ?? null,
        worstScenarioLabel: worst?.scenario_label ?? null,
        worstGrossPayout: Number(worst?.gross_payout ?? 0),
        worstNetLiability: netLiab,
        exposureStale: isStale,
        lastCalculatedAt: m.exposure_last_calculated_at ?? null,
        riskLevel: bankrollShortfall > 0 && netLiab > 0 ? "critical" : riskLevelFor(netLiab),
      });
    }
    exposureRows.sort((a, b) => b.worstNetLiability - a.worstNetLiability);

    // Stale matches with pending bets
    const staleMatches = exposureRows
      .filter((r) => r.exposureStale)
      .map((r) => ({
        matchId: r.matchId,
        match: r.match,
        kickoffAt: r.kickoffAt,
        pendingBetCount: r.pendingBetCount,
        pendingStake: r.pendingStake,
        lastCalculatedAt: r.lastCalculatedAt,
      }));

    // Correlated alerts breakdown
    const openAlerts = (alertsRaw ?? []).filter((a: any) => a.status === "open" || a.status === "stale");
    const openCorrelatedAlertCount = openAlerts.length;
    const criticalHighAlertCount = openAlerts.filter(
      (a: any) => a.severity === "critical" || a.severity === "high",
    ).length;

    // Maker-checker counts
    const payoutBuckets = {
      pending: 0,
      approved_not_completed: 0,
    };
    for (const p of payoutStatuses ?? []) {
      if (p.status === "pending") payoutBuckets.pending += 1;
      else if (p.status === "approved") payoutBuckets.approved_not_completed += 1;
    }
    const walletAdjBuckets = { pending: 0, rejected: 0 };
    for (const w of walletAdjStatuses ?? []) {
      if (w.status === "pending") walletAdjBuckets.pending += 1;
      else if (w.status === "rejected") walletAdjBuckets.rejected += 1;
    }

    // Market rules count
    let activeRules = 0;
    let inactiveRules = 0;
    for (const r of marketRules ?? []) {
      if ((r as any).is_active) activeRules += 1;
      else inactiveRules += 1;
    }

    // Wallet buckets (separated from betting P&L)
    const walletBuckets = {
      deposits_point_approvals: 0,
      withdrawals_payouts: 0,
      admin_credits: 0,
      admin_debits: 0,
      bonuses_corrections: 0,
      uncategorized: 0,
    };
    for (const t of walletTxns ?? []) {
      const amt = Number(t.amount || 0);
      const cat = (t.transaction_category ?? "uncategorized").toString();
      switch (cat) {
        case "point_request_approval":
        case "deposit":
          walletBuckets.deposits_point_approvals += amt;
          break;
        case "payout":
        case "withdrawal":
          walletBuckets.withdrawals_payouts += amt;
          break;
        case "admin_adjustment_credit":
          walletBuckets.admin_credits += amt;
          break;
        case "admin_adjustment_debit":
          walletBuckets.admin_debits += amt;
          break;
        case "bonus":
        case "correction":
          walletBuckets.bonuses_corrections += amt;
          break;
        default:
          walletBuckets.uncategorized += amt;
      }
    }

    // Audit rows – filter to sensitive ops
    const AUDIT_PATTERNS = /^(payout|wallet_adjustment|bankroll|platform_bankroll|odds|match_odds|settlement|prediction\.settle|role|user_role|admin_role)/;
    const auditRecent = (recentAudit ?? []).filter((r: any) => AUDIT_PATTERNS.test(r.action ?? ""));

    return {
      generatedAt: new Date().toISOString(),
      bankroll: {
        available: !!bankrollRow,
        balance: bankroll,
        updatedAt: bankrollUpdatedAt,
      },
      risk: {
        pendingStake,
        openGrossExposure,
        openNetLiability,
        worstCaseGrossPayout,
        worstCaseNetLiability,
        bankrollCoverageRatio,
        bankrollShortfall,
        staleMatchCount,
        openCorrelatedAlertCount,
        criticalHighAlertCount,
      },
      pnl: {
        totalStakeAccepted,
        settledStake,
        pendingStake,
        grossWinningPayouts,
        voidRefundAmount,
        housePnL,
        openGrossExposure,
        openNetLiability,
      },
      walletBuckets,
      exposureRows,
      staleMatches,
      makerChecker: {
        allowSelfApproval: !!(settingsRow as any)?.allow_single_admin_self_approval,
        pendingPayouts: payoutBuckets.pending,
        approvedNotCompletedPayouts: payoutBuckets.approved_not_completed,
        pendingWalletAdjustments: walletAdjBuckets.pending,
        rejectedWalletAdjustments: walletAdjBuckets.rejected,
      },
      marketRules: { active: activeRules, inactive: inactiveRules },
      auditRecent: auditRecent.slice(0, 20).map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        action: r.action,
        actorId: r.user_id,
        targetUserId: r.target_user_id,
        entity: r.entity,
        entityId: r.entity_id,
        summary: summariseMetadata(r.metadata, r.reason),
      })),
    };
  });

function summariseMetadata(meta: any, reason: string | null): string {
  const parts: string[] = [];
  if (meta && typeof meta === "object") {
    if (meta.amount != null) parts.push(`amount ${meta.amount}`);
    if (meta.status) parts.push(`status ${meta.status}`);
    if (meta.self_approval != null) parts.push(`self_approval ${meta.self_approval}`);
    if (meta.reference) parts.push(String(meta.reference));
  }
  if (reason) parts.push(reason);
  return parts.join(" · ").slice(0, 160);
}

// -------- Scenario breakdown for one match ----------
export const getMatchScenarioBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("match_exposure_scenarios")
      .select("scenario_key, scenario_label, gross_payout, net_liability, total_stake_involved, winning_bet_count, calculated_at")
      .eq("match_id", data.matchId)
      .order("net_liability", { ascending: false });
    return { rows: rows ?? [] };
  });

// -------- Trigger recalculation (single match) --------
export const recalculateMatchExposure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      matchId: z.string().uuid(),
      includeCorrelated: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: Record<string, { ok: boolean; error?: string }> = {};
    try {
      const { error } = await (supabaseAdmin as any).rpc(
        "recalculate_match_scenario_exposure",
        { p_match_id: data.matchId },
      );
      results.scenario = error ? { ok: false, error: error.message } : { ok: true };
    } catch (e: any) {
      results.scenario = { ok: false, error: e?.message ?? "failed" };
    }
    if (data.includeCorrelated) {
      try {
        const { error } = await (supabaseAdmin as any).rpc(
          "recalculate_correlated_exposure",
          { p_match_id: data.matchId },
        );
        results.correlated = error ? { ok: false, error: error.message } : { ok: true };
      } catch (e: any) {
        results.correlated = { ok: false, error: e?.message ?? "failed" };
      }
    }
    return { matchId: data.matchId, results };
  });

// -------- Bulk recalculation for all stale matches --------
export const recalculateAllStaleMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staleMatchRows } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team")
      .eq("exposure_is_stale" as any, true)
      .eq("is_simulation" as any, false);

    const results: Array<{
      matchId: string;
      match: string;
      scenario: { ok: boolean; error?: string };
      correlated: { ok: boolean; error?: string };
    }> = [];

    for (const m of staleMatchRows ?? []) {
      const label = `${m.home_team} vs ${m.away_team}`;
      let scenarioRes: { ok: boolean; error?: string };
      let correlatedRes: { ok: boolean; error?: string };
      try {
        const { error } = await (supabaseAdmin as any).rpc(
          "recalculate_match_scenario_exposure",
          { p_match_id: m.id },
        );
        scenarioRes = error ? { ok: false, error: error.message } : { ok: true };
      } catch (e: any) {
        scenarioRes = { ok: false, error: e?.message ?? "failed" };
      }
      try {
        const { error } = await (supabaseAdmin as any).rpc(
          "recalculate_correlated_exposure",
          { p_match_id: m.id },
        );
        correlatedRes = error ? { ok: false, error: error.message } : { ok: true };
      } catch (e: any) {
        correlatedRes = { ok: false, error: e?.message ?? "failed" };
      }
      results.push({
        matchId: m.id,
        match: label,
        scenario: scenarioRes,
        correlated: correlatedRes,
      });
    }

    const summary = {
      total: results.length,
      scenarioOk: results.filter((r) => r.scenario.ok).length,
      scenarioFailed: results.filter((r) => !r.scenario.ok).length,
      correlatedOk: results.filter((r) => r.correlated.ok).length,
      correlatedFailed: results.filter((r) => !r.correlated.ok).length,
    };
    return { summary, results };
  });
