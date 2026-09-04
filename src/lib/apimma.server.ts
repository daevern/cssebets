// Server-only: API-Sports MMA (https://v1.mma.api-sports.io)
// Uses the same API_FOOTBALL_KEY (single API-Sports account key covers all
// subscribed APIs — MMA included).
//
// Paid plan: generous daily quota + real-time odds movement + live in-fight
// stats. Callers still gate hot loops (see runUfcOddsSync freshness guards)
// so we don't burn quota re-fetching data that doesn't change tick-to-tick.
const BASE = "https://v1.mma.api-sports.io";

export type ApiMmaResponse<T> = {
  get: string;
  parameters: Record<string, unknown>;
  errors: unknown;
  results: number;
  paging?: { current: number; total: number };
  response: T;
};

export type ApiMmaFight = {
  id: number;
  date: string; // ISO
  time?: string;
  timestamp: number;
  timezone?: string;
  slug?: string; // e.g. "UFC 329: McGregor vs. Holloway 2"
  is_main: boolean;
  category?: string | null;
  status: { long: string; short: string };
  fighters: {
    first: { id: number; name: string; logo?: string; winner?: boolean | null };
    second: { id: number; name: string; logo?: string; winner?: boolean | null };
  };
};

export type ApiMmaFighter = {
  id: number;
  name: string;
  nickname?: string | null;
  age?: number | null;
  gender?: string | null;
  category?: string | null;
  height?: string | null;
  weight?: string | null;
  reach?: string | null;
  stance?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  country?: string | null;
  photo?: string | null;
  team?: { id: number | null; name: string | null } | null;
  record?: { wins: number; losses: number; draws: number } | null;
};

export type ApiMmaOddsResponse = Array<{
  fight: { id: number };
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}>;

export type ApiMmaStatsResponse = Array<{
  fighter: { id: number; name: string };
  statistics: Array<{ type: string; value: string | number | null }>;
}>;

export type ApiMmaFighterRecord = {
  id: number;
  date: string;
  slug?: string;
  is_main: boolean;
  category?: string | null;
  status: { long: string; short: string };
  fighters: ApiMmaFight["fighters"];
};

export type ApiMmaFighterRecordSummary = {
  fighter: { id: number; name: string; photo?: string | null };
  total?: { win?: number | null; loss?: number | null; draw?: number | null } | null;
  ko?: { win?: number | null; loss?: number | null } | null;
  sub?: { win?: number | null; loss?: number | null } | null;
};

import { withRetry } from "@/features/football/services/retry";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * API-Sports answers plan/quota problems with HTTP 200 + a populated `errors`
 * object and an empty response. Silently treating that as "no fights" is what
 * made UFC look permanently empty, so surface it as a typed error instead.
 */
export class ApiMmaPlanError extends Error {
  readonly kind: "plan" | "quota" | "auth" | "other";
  constructor(message: string, kind: ApiMmaPlanError["kind"]) {
    super(message);
    this.name = "ApiMmaPlanError";
    this.kind = kind;
  }
}

function assertNoFeedError(path: string, body: ApiMmaResponse<unknown>) {
  const errors = body.errors as unknown;
  if (!errors || Array.isArray(errors)) return;
  const entries = Object.entries(errors as Record<string, string>);
  if (entries.length === 0) return;
  const [field, message] = entries[0]!;
  const kind: ApiMmaPlanError["kind"] =
    field === "plan" ? "plan"
    : field === "requests" || field === "rateLimit" ? "quota"
    : field === "token" || field === "key" ? "auth"
    : "other";
  throw new ApiMmaPlanError(`api-mma ${path}: ${field}: ${message}`, kind);
}

/**
 * Our own shared minute budget refused this call. This is NOT a provider
 * plan/quota refusal — it is transient back-pressure, so callers must not
 * flag the feed as plan-limited or store it as a sync error.
 */
export class ApiMmaBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiMmaBudgetError";
  }
}

export function isMmaBudgetError(e: unknown): boolean {
  return e instanceof ApiMmaBudgetError;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function apiMmaGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ApiMmaResponse<T>> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) throw new Error("API_FOOTBALL_KEY not set");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return withRetry(async () => {
    // All UFC cron routes share this database-backed minute budget. A local
    // counter is insufficient because production requests run in independent
    // workers and discovery, odds, and settlement can overlap.
    let allowedClaim = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: allowed, error: budgetError } = await (supabaseAdmin as any)
        .rpc("claim_api_mma_request", { p_limit: 20 });
      if (budgetError) throw new Error(`api-mma request budget failed: ${budgetError.message}`);
      if (allowed) { allowedClaim = true; break; }
      if (attempt < 2) await sleep(1500);
    }
    if (!allowedClaim) {
      throw new ApiMmaBudgetError(`api-mma ${path}: shared request budget exhausted`);
    }


    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": key, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`api-mma ${path} HTTP ${res.status}`);
    const body = (await res.json()) as ApiMmaResponse<T>;
    assertNoFeedError(path, body);
    return body;
  });
}

export type ApiMmaAccountStatus = {
  plan: string | null;
  active: boolean;
  requestsToday: number;
  requestLimit: number;
};

export async function fetchMmaStatus(): Promise<ApiMmaAccountStatus | null> {
  try {
    const r = await apiMmaGet<any>("/status");
    const s = r.response ?? null;
    if (!s) return null;
    return {
      plan: s.subscription?.plan ?? null,
      active: Boolean(s.subscription?.active),
      requestsToday: Number(s.requests?.current ?? 0),
      requestLimit: Number(s.requests?.limit_day ?? 0),
    };
  } catch {
    return null;
  }
}

export function isMmaQuotaError(e: unknown): boolean {
  return e instanceof ApiMmaPlanError && (e.kind === "quota" || e.kind === "plan");
}

// Provider quota is per-minute; once we trip it, further calls in the same
// window only burn budget and fail. Park all api-mma reads until the cooldown
// expires instead of hammering the feed on every cron tick.
let quotaCooldownUntil = 0;
const QUOTA_COOLDOWN_MS = 60_000;

export function mmaQuotaCoolingDown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

// Short-lived cache of the daily /fights response. Settlement, discovery and
// odds passes all ask for the same handful of dates every couple of minutes.
const FIGHTS_TTL_MS = 5 * 60_000;
const fightsCache = new Map<string, { at: number; rows: ApiMmaFight[] }>();

export async function fetchFightsByDate(date: string) {
  const cached = fightsCache.get(date);
  if (cached && Date.now() - cached.at < FIGHTS_TTL_MS) return cached.rows;
  if (mmaQuotaCoolingDown()) {
    if (cached) return cached.rows;
    throw new ApiMmaPlanError("api-mma /fights: rateLimit cooldown active", "quota");
  }
  try {
    const r = await apiMmaGet<ApiMmaFight[]>("/fights", { date });
    const rows = r.response ?? [];
    fightsCache.set(date, { at: Date.now(), rows });
    return rows;
  } catch (e) {
    if (isMmaQuotaError(e)) {
      quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
      if (cached) return cached.rows;
    }
    throw e;
  }
}


export async function fetchOddsForFight(fightId: number) {
  const r = await apiMmaGet<ApiMmaOddsResponse>("/odds", { fight: fightId });
  return r.response?.[0] ?? null;
}

export async function fetchFighter(id: number) {
  const r = await apiMmaGet<ApiMmaFighter[]>("/fighters", { id });
  return r.response?.[0] ?? null;
}

export async function searchFighter(name: string) {
  const q = name.split(" ").slice(-1)[0]?.trim();
  if (!q || q.length < 3) return null;
  try {
    const r = await apiMmaGet<ApiMmaFighter[]>("/fighters", { search: q });
    const list = r.response ?? [];
    if (!list.length) return null;
    // Prefer an exact-ish full name match.
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const target = norm(name);
    return list.find((f) => norm(f.name) === target) ?? list.find((f) => norm(f.name).includes(target)) ?? list[0];
  } catch {
    return null;
  }
}

export async function fetchFighterRecordSummary(id: number) {
  const r = await apiMmaGet<ApiMmaFighterRecordSummary[]>("/fighters/records", { id });
  return r.response?.[0] ?? null;
}

export async function fetchFightsForFighterSeason(id: number, season: number) {
  const r = await apiMmaGet<ApiMmaFighterRecord[]>("/fights", { fighter: id, season });
  return r.response ?? [];
}

export async function fetchFighterFightHistory(id: number, seasonsBack = 8) {
  const currentYear = new Date().getUTCFullYear();
  const out: ApiMmaFighterRecord[] = [];
  const seen = new Set<number>();
  for (let y = currentYear; y >= currentYear - seasonsBack; y--) {
    try {
      const rows = await fetchFightsForFighterSeason(id, y);
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    } catch {
      // Keep enrichment best-effort; paid API plans still return sparse years.
    }
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}


export async function fetchFightStats(fightId: number) {
  const r = await apiMmaGet<ApiMmaStatsResponse>("/fights/statistics/fighters", { id: fightId });
  return r.response ?? [];
}

// ---- Bookmaker preference: bet365, Pinnacle, Betfair, then first ----
const PREFERRED_BOOKMAKERS = [5, 9, 18, 2, 6];

export function pickBookmaker(bookmakers: NonNullable<ApiMmaOddsResponse[number]>["bookmakers"]) {
  for (const id of PREFERRED_BOOKMAKERS) {
    const b = bookmakers.find((x) => x.id === id);
    if (b?.bets?.length) return b;
  }
  return bookmakers.find((x) => x.bets?.length) ?? null;
}

// Parse "180 cm" / "5'9\"" / "175" into cm number, best-effort.
export function parseCm(v?: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d+(?:\.\d+)?)\s*cm/i);
  if (m) return Number(m[1]);
  const feet = v.match(/(\d+)\s*['\u2032]\s*(\d+)/);
  if (feet) return Math.round((Number(feet[1]) * 12 + Number(feet[2])) * 2.54);
  const inches = v.match(/(\d+(?:\.\d+)?)\s*(?:in|inches|['\u2032])/i);
  if (inches) return Math.round(Number(inches[1]) * 2.54);
  const bare = v.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (bare) return Number(bare[1]);
  return null;
}

export function parseLbs(v?: string | null): number | null {
  if (!v) return null;
  const lbs = v.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)/i);
  if (lbs) return Number(lbs[1]);
  const kg = v.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kg) return Math.round(Number(kg[1]) * 2.20462);
  const bare = v.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (bare) return Number(bare[1]);
  return null;
}
