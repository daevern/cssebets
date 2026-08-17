import { test, expect } from "@playwright/test";
import { adminClient } from "./helpers/supabaseAdmin";
import {
  postFootballSettle,
  postF1Settle,
  postHealthCheck,
  postUfcSettle,
} from "./helpers/settleHook";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";

/**
 * Phase A ops gate for CI: cron secret fail-closed, health persistence,
 * settle hook smoke. Requires CRON_HOOK_SECRET on both the app process and
 * this runner (see .github/workflows/e2e.yml).
 */
test.describe("Phase A ops (cron + health)", () => {
  test.beforeEach(() => {
    if (!process.env.CRON_HOOK_SECRET) {
      test.skip(true, "CRON_HOOK_SECRET required (set in e2e CI workflow)");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }
  });

  test("unauthenticated health-check returns 401", async () => {
    const res = await fetch(`${BASE}/api/public/hooks/health-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
    const body = await res.json().catch(() => ({}));
    expect(body).toMatchObject({ ok: false });
  });

  test("authenticated health-check returns 200 and writes health_check_runs", async () => {
    const before = Date.now();
    const { ok, body } = await postHealthCheck();
    expect(ok).toBe(true);
    expect(body).toMatchObject({
      overall: expect.stringMatching(/^(ok|degraded|failed)$/),
      checks: expect.any(Array),
    });

    const sb = adminClient();
    await expect
      .poll(
        async () => {
          const { data, error } = await sb
            .from("health_check_runs")
            .select("id, check_name, created_at")
            .gte("created_at", new Date(before - 5_000).toISOString())
            .limit(5);
          if (error) throw new Error(error.message);
          return data?.length ?? 0;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
  });

  test("settle hooks return 200 with cron secret", async () => {
    const football = await postFootballSettle();
    expect(football.ok).toBe(true);

    const f1 = await postF1Settle();
    expect(f1.ok).toBe(true);

    const ufc = await postUfcSettle();
    expect(ufc.ok).toBe(true);
  });
});
