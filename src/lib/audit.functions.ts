import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform audit runner (admin only).
 *
 * Executes the complete non-destructive accounting / fairness test battery.
 * Every suite is either read-only or runs inside the SIMULATION environment and
 * rolls itself back, so this is safe to run against production at any time.
 */

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  return roles.includes("admin") || roles.includes("super_admin");
}

export type AuditSuiteResult = {
  key: string;
  label: string;
  ok: boolean | null;
  summary: string;
  detail: any;
};

const SUITES: { key: string; label: string; rpc: string; args?: Record<string, unknown> }[] = [
  { key: "phase10", label: "Full accounting self-test (invariants + product lifecycles)", rpc: "accounting_phase10_selftest" },
  { key: "invariants", label: "Ledger invariants over live data", rpc: "accounting_phase10_invariants" },
  { key: "rounding", label: "Monetary rounding policy", rpc: "accounting_phase8_selftest" },
  { key: "arcade", label: "Arcade stake/payout journal lifecycles", rpc: "accounting_arcade_selftest" },
  { key: "liability", label: "Liability reservation integrity", rpc: "accounting_phase6_selftest" },
  { key: "blackjack", label: "Blackjack payout ceiling & exposure", rpc: "arcade_bj_phase7_selftest" },
  { key: "integrity", label: "Journal integrity scan", rpc: "accounting_integrity_scan" },
  {
    key: "bankroll",
    label: "Bankroll reconciliation (journal vs legacy)",
    rpc: "accounting_bankroll_reconciliation",
    args: { p_environment: "PRODUCTION" },
  },
];

function summarise(data: any): { ok: boolean | null; summary: string } {
  if (data == null) return { ok: null, summary: "No data returned" };
  if (typeof data === "object" && !Array.isArray(data)) {
    if (typeof data.all_ok === "boolean") return { ok: data.all_ok, summary: data.all_ok ? "All checks passed" : "Failures detected" };
    if (typeof data.passed === "number" && typeof data.total === "number") {
      return { ok: (data.failed ?? data.total - data.passed) === 0, summary: `${data.passed}/${data.total} passed` };
    }
    if (typeof data.ok === "boolean") return { ok: data.ok, summary: data.ok ? "OK" : "Issues found" };
  }
  if (Array.isArray(data)) {
    const failed = data.filter((r: any) => r?.passed === false || r?.ok === false).length;
    return { ok: failed === 0, summary: `${data.length - failed}/${data.length} passed` };
  }
  return { ok: null, summary: "Report generated" };
}

export const runPlatformAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ startedAt: string; finishedAt: string; ok: boolean; results: AuditSuiteResult[] }> => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startedAt = new Date().toISOString();
    const results: AuditSuiteResult[] = [];

    for (const suite of SUITES) {
      try {
        const { data, error } = await (supabaseAdmin as any).rpc(suite.rpc, suite.args ?? {});
        if (error) {
          results.push({ key: suite.key, label: suite.label, ok: false, summary: error.message, detail: null });
          continue;
        }
        const { ok, summary } = summarise(data);
        results.push({ key: suite.key, label: suite.label, ok, summary, detail: data });
      } catch (e) {
        results.push({ key: suite.key, label: suite.label, ok: false, summary: (e as Error).message, detail: null });
      }
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: results.every((r) => r.ok !== false),
      results,
    };
  });
