// Server-only health checks. Imported only from server functions / server routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CheckResult = {
  name: string;
  status: "ok" | "degraded" | "failed";
  duration_ms: number;
  error?: string | null;
  metadata?: any;
};

async function timed(name: string, fn: () => Promise<Omit<CheckResult, "name" | "duration_ms">>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { name, duration_ms: Date.now() - t0, ...r };
  } catch (e: any) {
    return { name, status: "failed", duration_ms: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

export async function runHealthChecks() {
  const checks: CheckResult[] = [];

  checks.push(await timed("database", async () => {
    const { error } = await supabaseAdmin.from("platform_settings").select("id").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return { status: "ok" };
  }));

  checks.push(await timed("settlement_queue", async () => {
    const { count, error } = await supabaseAdmin
      .from("predictions")
      .select("id, matches!inner(status)", { count: "exact", head: true })
      .eq("status", "pending").eq("matches.status", "finished");
    if (error) throw new Error(error.message);
    return { status: (count ?? 0) > 0 ? "degraded" : "ok", metadata: { pending_finished: count ?? 0 } };
  }));

  checks.push(await timed("odds_sync", async () => {
    const { data, error } = await supabaseAdmin
      .from("matches").select("odds_updated_at").not("odds_updated_at", "is", null)
      .order("odds_updated_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const last = (data ?? [])[0]?.odds_updated_at;
    if (!last) return { status: "degraded", metadata: { reason: "no odds_updated_at recorded" } };
    const ageHr = (Date.now() - new Date(last).getTime()) / 3_600_000;
    return { status: ageHr > 24 ? "degraded" : "ok", metadata: { last, age_hours: ageHr } };
  }));

  checks.push(await timed("reconciliation", async () => {
    const { data, error } = await (supabaseAdmin as any).rpc("run_reconciliation_check");
    if (error) throw new Error(error.message);
    return { status: data?.overall_status === "OK" ? "ok" : "degraded", metadata: { overall: data?.overall_status } };
  }));

  checks.push(await timed("support_service", async () => {
    const { count, error } = await supabaseAdmin
      .from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "open");
    if (error) throw new Error(error.message);
    return { status: "ok", metadata: { open: count ?? 0 } };
  }));

  checks.push(await timed("point_requests", async () => {
    const { count, error } = await supabaseAdmin
      .from("point_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { status: (count ?? 0) > 50 ? "degraded" : "ok", metadata: { pending: count ?? 0 } };
  }));

  checks.push(await timed("payout_requests", async () => {
    const { count, error } = await supabaseAdmin
      .from("payout_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { status: (count ?? 0) > 50 ? "degraded" : "ok", metadata: { pending: count ?? 0 } };
  }));

  const ageMinutes = (iso: string | null | undefined) =>
    iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : null;

  checks.push(await timed("football_sync", async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("sports_sync_runs")
      .select("finished_at, started_at, status, job_type")
      .eq("sport_code", "football")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (!row) return { status: "degraded" as const, metadata: { reason: "no football sync runs yet" } };
    const last = row.finished_at ?? row.started_at;
    const age = ageMinutes(last);
    return {
      status: age != null && age > 90 ? ("degraded" as const) : ("ok" as const),
      metadata: { last, age_minutes: age, job_type: row.job_type, run_status: row.status },
    };
  }));

  checks.push(await timed("football_settle", async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("sports_settlement_runs")
      .select("created_at, status, finished_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (!row) {
      return { status: "ok" as const, metadata: { reason: "no settlement runs yet (idle ok)" } };
    }
    const last = row.finished_at ?? row.created_at;
    const age = ageMinutes(last);
    return {
      status: row.status === "failed" ? ("degraded" as const) : ("ok" as const),
      metadata: { last, age_minutes: age, run_status: row.status },
    };
  }));

  checks.push(await timed("f1_sync", async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("f1_sync_runs")
      .select("finished_at, started_at, status, task")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (!row) return { status: "degraded" as const, metadata: { reason: "no f1 sync runs yet" } };
    const last = row.finished_at ?? row.started_at;
    const age = ageMinutes(last);
    return {
      status: age != null && age > 180 ? ("degraded" as const) : ("ok" as const),
      metadata: { last, age_minutes: age, task: row.task, run_status: row.status },
    };
  }));

  checks.push(await timed("ufc_sync", async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("ufc_feed_state")
      .select("last_discovery_at, last_odds_at, plan_limited, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "degraded" as const, metadata: { reason: "no ufc_feed_state row" } };
    const last = data.last_odds_at ?? data.last_discovery_at ?? data.updated_at;
    const age = ageMinutes(last);
    return {
      status:
        data.plan_limited || (age != null && age > 180)
          ? ("degraded" as const)
          : ("ok" as const),
      metadata: {
        last,
        age_minutes: age,
        plan_limited: data.plan_limited,
        last_discovery_at: data.last_discovery_at,
        last_odds_at: data.last_odds_at,
      },
    };
  }));

  checks.push(await timed("health_cron_heartbeat", async () => {
    const { data, error } = await supabaseAdmin
      .from("health_check_runs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const last = (data ?? [])[0]?.created_at ?? null;
    const age = ageMinutes(last);
    // Before this run persists, last may be stale — still useful for ops.
    return {
      status: age != null && age > 20 ? ("degraded" as const) : ("ok" as const),
      metadata: { last, age_minutes: age, expected_cadence: "≈5m via /api/public/hooks/health-check" },
    };
  }));

  // Persist
  const rows = checks.map((c) => ({
    check_name: c.name, status: c.status, duration_ms: c.duration_ms,
    error: c.error ?? null, metadata: c.metadata ?? {},
  }));
  await supabaseAdmin.from("health_check_runs").insert(rows);

  const overall = checks.some((c) => c.status === "failed")
    ? "failed"
    : checks.some((c) => c.status === "degraded") ? "degraded" : "ok";
  return { overall, checks };
}
