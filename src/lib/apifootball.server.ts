// Server-only: API-Football client with daily quota guard.
// Pro plan = 7,500 requests / day, 450 req / minute.
// All callers MUST go through `apiFootballGet` so the quota is enforced.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://v3.football.api-sports.io";

// World Cup 2026 — pinned at the integration level so callers cannot leak
// quota to other competitions.
export const WC_LEAGUE_ID = 1;
export const WC_SEASON = 2026;

export type QuotaSnapshot = {
  allowed: boolean;
  used: number;
  day_limit: number;
  remaining: number;
};

async function consumeQuota(requests = 1): Promise<QuotaSnapshot> {
  const { data, error } = await (supabaseAdmin as any).rpc(
    "apifootball_consume_quota",
    { p_requests: requests },
  );
  if (error) throw new Error(`quota check failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: !!row?.allowed,
    used: Number(row?.used ?? 0),
    day_limit: Number(row?.day_limit ?? 100),
    remaining: Number(row?.remaining ?? 0),
  };
}

export async function getQuotaStatus(): Promise<QuotaSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await (supabaseAdmin as any)
    .from("apifootball_quota")
    .select("used, day_limit")
    .eq("day", today)
    .maybeSingle();
  const used = Number((data as any)?.used ?? 0);
  const limit = Number((data as any)?.day_limit ?? 100);
  return { allowed: used < limit, used, day_limit: limit, remaining: limit - used };
}

/** GET against api-football, decrements the daily quota by 1. */
export async function apiFootballGet<T = any>(
  pathWithQuery: string,
): Promise<{ data: T; quota: QuotaSnapshot } | { skipped: true; reason: string; quota: QuotaSnapshot }> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) {
    const q = await getQuotaStatus();
    return { skipped: true, reason: "API_FOOTBALL_KEY not set", quota: q };
  }

  const quota = await consumeQuota(1);
  if (!quota.allowed) {
    return { skipped: true, reason: "daily quota exhausted", quota };
  }

  const res = await fetch(`${BASE}${pathWithQuery}`, {
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`api-football ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as any;
  // api-football wraps results in { response: [...] }
  if (json?.errors && Object.keys(json.errors).length) {
    // Some plan / params errors are returned as 200s with body errors.
    const msg = JSON.stringify(json.errors);
    if (msg !== "[]") throw new Error(`api-football error: ${msg}`);
  }
  return { data: (json?.response ?? json) as T, quota };
}
