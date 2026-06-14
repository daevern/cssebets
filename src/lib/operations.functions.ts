// Operations console server functions.
// Read-only aggregations over existing tables + CRUD for new tables:
// incidents, operational_alerts, health_check_runs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const READ_TIERS = ["admin", "super_admin", "viewer"] as const;
const WRITE_TIERS = ["admin", "super_admin"] as const;

async function getRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}
async function requireTier(supabase: any, userId: string, tiers: readonly string[]) {
  const roles = await getRoles(supabase, userId);
  if (!roles.some((r) => tiers.includes(r))) throw new Error("Forbidden");
}

async function audit(adminClient: any, params: {
  userId: string; action: string; entity: string; entityId?: string | null;
  oldValue?: unknown; newValue?: unknown; reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await adminClient.from("audit_log").insert({
    user_id: params.userId,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
  });
}

// =========================================================================
// OPERATIONS DASHBOARD
// =========================================================================

export const getOperationsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const sinceDay = new Date(now - 24 * 3600 * 1000).toISOString();
    const sinceWeek = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const [
      regUsers, activeRowsDay, betsDay, betsWeek, stakesDay, stakesWeek,
      pendingPoints, pendingPayouts, openSupport, failedSettlements,
      rateHits, auditAlerts, settings, bankroll, openIncidents, openAlerts,
      lastSettleRows,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("predictions").select("user_id").gte("created_at", sinceDay),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).gte("created_at", sinceDay),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).gte("created_at", sinceWeek),
      supabaseAdmin.from("predictions").select("virtual_stake").gte("created_at", sinceDay),
      supabaseAdmin.from("predictions").select("virtual_stake").gte("created_at", sinceWeek),
      supabaseAdmin.from("point_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("payout_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
      // "failed settlement" proxy: finished matches with pending predictions
      supabaseAdmin
        .from("predictions")
        .select("match_id, matches!inner(status)", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("matches.status", "finished"),
      supabaseAdmin.from("rate_limits").select("id", { count: "exact", head: true }).gte("created_at", sinceDay),
      supabaseAdmin.from("audit_log").select("id", { count: "exact", head: true })
        .gte("created_at", sinceDay)
        .in("action", ["reconciliation.drift_detected", "match.void", "user.suspend", "wallet.adjust"]),
      supabaseAdmin.from("platform_settings").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("platform_bankroll").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      supabaseAdmin.from("operational_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("predictions").select("settled_at").not("settled_at", "is", null)
        .order("settled_at", { ascending: false }).limit(1),
    ]);

    const stakeDaySum = (stakesDay.data ?? []).reduce((s: number, r: any) => s + Number(r.virtual_stake || 0), 0);
    const stakeWeekSum = (stakesWeek.data ?? []).reduce((s: number, r: any) => s + Number(r.virtual_stake || 0), 0);
    const activeUsers = new Set((activeRowsDay.data ?? []).map((r: any) => r.user_id)).size;

    const s: any = settings.data ?? {};
    const b: any = bankroll.data ?? {};
    const lastSettleAt = (lastSettleRows.data ?? [])[0]?.settled_at ?? null;

    return {
      health: {
        platform: s.bets_paused ? "warning" : "ok",
        betting: s.bets_paused ? "warning" : "ok",
        settlement: (failedSettlements.count ?? 0) > 0 ? "warning" : "ok",
        oddsSync: "ok", // no failure store exists; surface ok unless we add one
        support: (openSupport.count ?? 0) > 20 ? "warning" : "ok",
        reconciliation: (auditAlerts.count ?? 0) > 0 ? "warning" : "ok",
      },
      metrics: {
        registeredUsers: regUsers.count ?? 0,
        activeUsersDay: activeUsers,
        betsDay: betsDay.count ?? 0,
        betsWeek: betsWeek.count ?? 0,
        stakeDay: stakeDaySum,
        stakeWeek: stakeWeekSum,
        pendingPoints: pendingPoints.count ?? 0,
        pendingPayouts: pendingPayouts.count ?? 0,
        openSupport: openSupport.count ?? 0,
        failedSettlements: failedSettlements.count ?? 0,
        rateLimitHits24h: rateHits.count ?? 0,
        auditAlerts24h: auditAlerts.count ?? 0,
        openIncidents: openIncidents.count ?? 0,
        openAlerts: openAlerts.count ?? 0,
        bankrollBalance: Number(b.balance ?? 0),
        betsPaused: !!s.bets_paused,
        lastSettleAt,
      },
    };
  });

// =========================================================================
// SETTLEMENT MONITORING
// =========================================================================

export const getSettlementMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sinceDay = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [pending, completedDay, failed, last, voided] = await Promise.all([
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true })
        .in("status", ["won", "lost"]).gte("settled_at", sinceDay),
      supabaseAdmin.from("predictions")
        .select("id, match_id, created_at, matches!inner(home_team, away_team, status)")
        .eq("status", "pending").eq("matches.status", "finished").limit(50),
      supabaseAdmin.from("predictions").select("settled_at").not("settled_at", "is", null)
        .order("settled_at", { ascending: false }).limit(1),
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true })
        .eq("status", "void").gte("settled_at", sinceDay),
    ]);

    return {
      pending: pending.count ?? 0,
      completed24h: completedDay.count ?? 0,
      voided24h: voided.count ?? 0,
      failedCount: failed.data?.length ?? 0,
      failedRows: (failed.data ?? []).map((r: any) => ({
        id: r.id,
        match_id: r.match_id,
        match: r.matches ? `${r.matches.home_team} vs ${r.matches.away_team}` : "—",
        created_at: r.created_at,
      })),
      lastSettleAt: (last.data ?? [])[0]?.settled_at ?? null,
    };
  });

export const retryFailedSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error: me } = await supabaseAdmin
      .from("matches")
      .select("id, home_score, away_score, home_score_ht, away_score_ht, status")
      .eq("id", data.matchId).maybeSingle();
    if (me) throw new Error(me.message);
    if (!m || m.status !== "finished" || m.home_score == null || m.away_score == null) {
      throw new Error("Match is not finished with a recorded score.");
    }
    const { data: settled, error } = await (supabaseAdmin as any).rpc("settle_match_all_markets_atomic", {
      p_match_id: m.id, p_home: m.home_score, p_away: m.away_score,
      p_home_ht: m.home_score_ht, p_away_ht: m.away_score_ht,
    });
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, {
      userId: context.userId, action: "settlement.retry",
      entity: "match", entityId: m.id, metadata: { settled },
    });
    return { settled: Number(settled ?? 0) };
  });

// =========================================================================
// INCIDENTS
// =========================================================================

const IncidentCategory = z.enum(["wallet","settlement","odds","point_requests","payouts","support","security","other"]);
const IncidentSeverity = z.enum(["low","medium","high","critical"]);
const IncidentStatus = z.enum(["open","investigating","resolved","closed"]);

export const listIncidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: IncidentStatus.optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("incidents").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.created_by, r.assigned_to]).filter(Boolean)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = (id: string | null) =>
      id ? (profiles?.find((p: any) => p.id === id)?.display_name ?? id.slice(0, 8)) : "—";
    return {
      incidents: (rows ?? []).map((r: any) => ({
        ...r,
        created_by_name: nameOf(r.created_by),
        assigned_to_name: nameOf(r.assigned_to),
      })),
    };
  });

export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    title: z.string().trim().min(3).max(160),
    category: IncidentCategory,
    severity: IncidentSeverity,
    notes: z.string().trim().max(4000).optional().default(""),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("incidents").insert({
      title: data.title, category: data.category, severity: data.severity,
      notes: data.notes || null, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, {
      userId: context.userId, action: "incident.create",
      entity: "incident", entityId: row.id, newValue: row,
    });
    return { id: row.id };
  });

export const updateIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    status: IncidentStatus.optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    notes: z.string().max(8000).optional(),
    resolution_summary: z.string().max(4000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: old } = await supabaseAdmin.from("incidents").select("*").eq("id", data.id).single();
    const patch: any = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "resolved" || data.status === "closed") patch.resolved_at = new Date().toISOString();
    }
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.resolution_summary !== undefined) patch.resolution_summary = data.resolution_summary;
    const { error } = await supabaseAdmin.from("incidents").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, {
      userId: context.userId, action: "incident.update",
      entity: "incident", entityId: data.id, oldValue: old, newValue: patch,
    });
    return { ok: true };
  });

// =========================================================================
// OPERATIONAL ALERTS
// =========================================================================

const AlertLevel = z.enum(["info","warning","critical"]);
const AlertStatus = z.enum(["open","acknowledged","resolved"]);

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: AlertStatus.optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("operational_alerts").select("*").order("created_at", { ascending: false }).limit(300);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { alerts: rows ?? [] };
  });

export const generateAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sinceDay = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [failedSettle, payoutSpike, pointSpike, rateSpike, bankroll, settings, drift, support] =
      await Promise.all([
        (async () => {
          const { count } = await supabaseAdmin
            .from("predictions")
            .select("id, matches!inner(status)", { count: "exact", head: true })
            .eq("status", "pending").eq("matches.status", "finished" as any);
          return { count: count ?? 0 };
        })(),
        supabaseAdmin.from("payout_requests").select("id", { count: "exact", head: true })
          .eq("status", "pending").gte("created_at", sinceDay),
        supabaseAdmin.from("point_requests").select("id", { count: "exact", head: true })
          .eq("status", "pending").gte("requested_at", sinceDay),
        supabaseAdmin.from("rate_limits").select("id", { count: "exact", head: true }).gte("created_at", sinceDay),
        supabaseAdmin.from("platform_bankroll").select("balance").eq("id", 1).maybeSingle(),
        supabaseAdmin.from("platform_settings").select("*").eq("id", 1).maybeSingle(),
        supabaseAdmin.from("audit_log").select("id", { count: "exact", head: true })
          .eq("action", "reconciliation.drift_detected").gte("created_at", sinceDay),
        supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);

    const inserts: any[] = [];
    const add = (level: string, category: string, title: string, message: string, metadata: any = {}) => {
      inserts.push({ level, category, title, message, metadata });
    };

    if ((drift.count ?? 0) > 0) add("critical","reconciliation","Reconciliation drift detected",
      `${drift.count} drift event(s) in last 24h`, { count: drift.count });
    if ((failedSettle.count ?? 0) > 0) add("critical","settlement","Failed settlements",
      `${failedSettle.count} finished matches still have pending predictions`, { count: failedSettle.count });
    if ((payoutSpike.count ?? 0) > 20) add("warning","payouts","Payout backlog",
      `${payoutSpike.count} pending payout requests in last 24h`, { count: payoutSpike.count });
    if ((pointSpike.count ?? 0) > 30) add("warning","point_requests","Point-request backlog",
      `${pointSpike.count} pending point requests in last 24h`, { count: pointSpike.count });
    if ((rateSpike.count ?? 0) > 100) add("warning","security","Rate-limit spike",
      `${rateSpike.count} rate-limit events in last 24h`, { count: rateSpike.count });
    const bal = Number(bankroll.data?.balance ?? 0);
    if (bal > 0 && bal < 50000) add("warning","bankroll","Bankroll below threshold",
      `Platform bankroll is ${bal.toFixed(2)} (threshold 50,000)`, { balance: bal });
    if ((support.count ?? 0) > 25) add("warning","support","Support backlog",
      `${support.count} open conversations (threshold 25)`, { count: support.count });

    // dedupe: do not re-create same open alert with same title
    let created = 0;
    for (const a of inserts) {
      const { data: existing } = await supabaseAdmin.from("operational_alerts")
        .select("id").eq("status", "open").eq("title", a.title).limit(1);
      if (existing && existing.length) continue;
      await supabaseAdmin.from("operational_alerts").insert(a);
      created += 1;
    }

    await audit(supabaseAdmin, {
      userId: context.userId, action: "alerts.generate", entity: "alerts",
      metadata: { evaluated: inserts.length, created },
    });
    return { evaluated: inserts.length, created };
  });

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("operational_alerts").update({
      status: "acknowledged", acknowledged_by: context.userId, acknowledged_at: new Date().toISOString(),
    }).eq("id", data.id).eq("status", "open");
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, { userId: context.userId, action: "alert.acknowledge", entity: "alert", entityId: data.id });
    return { ok: true };
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("operational_alerts").update({
      status: "resolved", resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.id).neq("status", "resolved");
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, { userId: context.userId, action: "alert.resolve", entity: "alert", entityId: data.id });
    return { ok: true };
  });

// =========================================================================
// ADMIN ACTION REVIEW
// =========================================================================

const REVIEW_ACTIONS = [
  "wallet.adjust",
  "point_request.approve","point_request.reject",
  "payout.approve","payout.reject","payout.complete",
  "prediction.void","match.void","match.settle",
  "settings.update","risk.update",
  "user.suspend","user.unsuspend",
  "settlement.retry",
];

export const listAdminReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    action: z.string().max(60).optional(),
    days: z.number().int().min(1).max(90).default(30),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();
    let q = supabaseAdmin.from("audit_log").select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(500);
    if (data.action) q = q.eq("action", data.action);
    else q = q.in("action", REVIEW_ACTIONS);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.user_id, r.entity_id]).filter(Boolean)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nameOf = (id: string | null) =>
      id ? (profiles?.find((p: any) => p.id === id)?.display_name ?? id.slice(0, 8)) : "—";

    return {
      actions: REVIEW_ACTIONS,
      entries: (rows ?? []).map((r: any) => {
        const amount =
          (r.metadata?.amount ?? r.new_value?.amount ?? r.new_value?.requested_amount ?? null);
        return {
          id: r.id,
          created_at: r.created_at,
          action: r.action,
          staff_name: nameOf(r.user_id),
          subject_name: r.entity === "user" ? nameOf(r.entity_id) : nameOf(r.entity_id),
          amount: amount != null ? Number(amount) : null,
          reason: r.reason,
          entity: r.entity,
          entity_id: r.entity_id,
        };
      }),
    };
  });

// =========================================================================
// ANALYTICS
// =========================================================================

export const getPlatformAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    days: z.number().int().min(1).max(180).default(30),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();

    const [
      totalUsers, newUsers, activeRows, preds, bankroll, payouts,
      ticketsOpened, ticketsClosed, supportMsgs,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("predictions").select("user_id").gte("created_at", since),
      supabaseAdmin.from("predictions").select("market, virtual_stake, potential_return, status, created_at").gte("created_at", since),
      supabaseAdmin.from("platform_bankroll").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("payout_requests").select("amount, status").gte("created_at", since),
      supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "closed").gte("updated_at", since),
      supabaseAdmin.from("support_messages").select("created_at, conversation_id").gte("created_at", since).limit(2000),
    ]);

    const predRows = (preds.data ?? []) as any[];
    const totalBets = predRows.length;
    const totalStake = predRows.reduce((s, p) => s + Number(p.virtual_stake || 0), 0);
    const avgStake = totalBets > 0 ? totalStake / totalBets : 0;
    const marketCounts: Record<string, number> = {};
    for (const p of predRows) marketCounts[p.market] = (marketCounts[p.market] ?? 0) + 1;
    const topMarkets = Object.entries(marketCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const won = predRows.filter((p) => p.status === "won");
    const payoutsToWinners = won.reduce((s, p) => s + Number(p.potential_return || 0), 0);
    const netPL = totalStake - payoutsToWinners;
    const payoutVolume = (payouts.data ?? []).filter((p: any) => p.status === "completed")
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    const activeUsers = new Set((activeRows.data ?? []).map((r: any) => r.user_id)).size;
    const b: any = bankroll.data ?? {};

    return {
      range_days: data.days,
      users: { total: totalUsers.count ?? 0, active: activeUsers, new: newUsers.count ?? 0 },
      betting: { totalBets, totalStake, avgStake, topMarkets },
      financial: {
        bankroll: Number(b.balance ?? 0),
        exposure: 0, // surfaced separately on the bankroll page
        netPL,
        payoutVolume,
      },
      support: {
        ticketsOpened: ticketsOpened.count ?? 0,
        ticketsClosed: ticketsClosed.count ?? 0,
        messages: supportMsgs.data?.length ?? 0,
      },
    };
  });

// =========================================================================
// HEALTH CHECKS
// =========================================================================

export const listHealthRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("health_check_runs")
      .select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

export const runHealthChecksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTier(context.supabase, context.userId, WRITE_TIERS);
    const { runHealthChecks } = await import("@/lib/health-checks.server");
    return runHealthChecks();
  });

// =========================================================================
// SUPPORT OPERATIONS DASHBOARD
// =========================================================================

export const getSupportOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    days: z.number().int().min(1).max(90).default(30),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireTier(context.supabase, context.userId, READ_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 3600 * 1000).toISOString();

    const [open, unassigned, assigned, closed, convs, msgs, auditRows, staff] =
      await Promise.all([
        supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open").is("claimed_by", null),
        supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open").not("claimed_by", "is", null),
        supabaseAdmin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "closed").gte("updated_at", since),
        supabaseAdmin.from("support_conversations")
          .select("id, claimed_by, status, created_at, updated_at, last_user_message_at, last_staff_message_at")
          .gte("created_at", since).limit(2000),
        supabaseAdmin.from("support_messages")
          .select("conversation_id, sender_role, created_at")
          .gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
        supabaseAdmin.from("support_audit_logs")
          .select("actor_id, action_type, created_at")
          .gte("created_at", since).limit(5000),
        supabaseAdmin.from("user_roles").select("user_id, role")
          .in("role", ["customer_support", "admin", "super_admin"]),
      ]);

    const firstUser = new Map<string, number>();
    const firstStaff = new Map<string, number>();
    for (const m of (msgs.data ?? []) as any[]) {
      const t = new Date(m.created_at).getTime();
      if (m.sender_role === "user" && !firstUser.has(m.conversation_id)) firstUser.set(m.conversation_id, t);
      if (m.sender_role === "staff" && !firstStaff.has(m.conversation_id)) firstStaff.set(m.conversation_id, t);
    }
    const frDeltas: number[] = [];
    for (const [cid, u] of firstUser.entries()) {
      const s = firstStaff.get(cid);
      if (s && s >= u) frDeltas.push((s - u) / 60000);
    }
    const avgFirstResponseMin = frDeltas.length ? frDeltas.reduce((a, b) => a + b, 0) / frDeltas.length : 0;

    const resDeltas: number[] = [];
    for (const c of (convs.data ?? []) as any[]) {
      if (c.status === "closed") {
        const d = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 3600000;
        if (d >= 0) resDeltas.push(d);
      }
    }
    const avgResolutionHr = resDeltas.length ? resDeltas.reduce((a, b) => a + b, 0) / resDeltas.length : 0;

    const staffIds = new Set<string>();
    for (const r of (staff.data ?? []) as any[]) staffIds.add(r.user_id);
    const ticketsPerStaff = new Map<string, number>();
    for (const c of (convs.data ?? []) as any[]) {
      if (!c.claimed_by) continue;
      ticketsPerStaff.set(c.claimed_by, (ticketsPerStaff.get(c.claimed_by) ?? 0) + 1);
    }
    const KIND: Record<string, string[]> = {
      approvals: ["approve_point_request", "approve_registration"],
      rejections: ["reject_point_request"],
      proof_views: ["proof_viewed"],
      conversations_closed: ["support_conversation_closed"],
      messages_sent: ["support_message_sent"],
    };
    const activity = new Map<string, Record<string, number>>();
    for (const r of (auditRows.data ?? []) as any[]) {
      if (!r.actor_id) continue;
      const row = activity.get(r.actor_id) ?? { approvals: 0, rejections: 0, proof_views: 0, conversations_closed: 0, messages_sent: 0 };
      for (const [k, list] of Object.entries(KIND)) {
        if (list.includes(r.action_type)) row[k] = (row[k] ?? 0) + 1;
      }
      activity.set(r.actor_id, row);
    }
    const allIds = Array.from(new Set<string>([...staffIds, ...ticketsPerStaff.keys(), ...activity.keys()]));
    const { data: profiles } = allIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", allIds)
      : { data: [] as any[] };
    const profById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const roleById = new Map<string, string>();
    for (const r of (staff.data ?? []) as any[]) {
      const cur = roleById.get(r.user_id);
      // prioritise higher roles
      const rank: any = { super_admin: 3, admin: 2, customer_support: 1 };
      if (!cur || (rank[r.role] ?? 0) > (rank[cur] ?? 0)) roleById.set(r.user_id, r.role);
    }

    const perStaff = allIds.map((uid) => {
      const a = activity.get(uid) ?? { approvals: 0, rejections: 0, proof_views: 0, conversations_closed: 0, messages_sent: 0 };
      return {
        user_id: uid,
        name: profById.get(uid)?.display_name ?? uid.slice(0, 8),
        role: roleById.get(uid) ?? "staff",
        tickets_assigned: ticketsPerStaff.get(uid) ?? 0,
        approvals: a.approvals ?? 0,
        rejections: a.rejections ?? 0,
        proof_views: a.proof_views ?? 0,
        conversations_closed: a.conversations_closed ?? 0,
        messages_sent: a.messages_sent ?? 0,
      };
    }).sort((a, b) =>
      (b.tickets_assigned + b.approvals + b.rejections + b.messages_sent) -
      (a.tickets_assigned + a.approvals + a.rejections + a.messages_sent)
    );

    return {
      range_days: data.days,
      tickets: {
        open: open.count ?? 0,
        unassigned: unassigned.count ?? 0,
        assigned: assigned.count ?? 0,
        closed: closed.count ?? 0,
      },
      timings: {
        avg_first_response_min: Math.round(avgFirstResponseMin * 10) / 10,
        avg_resolution_hr: Math.round(avgResolutionHr * 10) / 10,
        sample_first_response: frDeltas.length,
        sample_resolution: resDeltas.length,
      },
      per_staff: perStaff,
    };
  });
