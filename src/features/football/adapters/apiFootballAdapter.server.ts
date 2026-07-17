// Isolated API-Football client for the new sports system.
// DELIBERATELY does NOT import src/lib/apifootball.server.ts — that file is
// dedicated to World Cup and must stay frozen. This client reuses the same
// API_FOOTBALL_KEY env var but tracks its own request pacing.

const BASE = "https://v3.football.api-sports.io";

let lastCallAt = 0;
async function pace(minGapMs = 250) {
  const wait = lastCallAt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export type ApiFootballResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number };

async function apiGet<T>(path: string): Promise<ApiFootballResult<T>> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) return { ok: false, reason: "API_FOOTBALL_KEY not set" };
  await pace();
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}`, status: res.status };
  }
  const json = (await res.json()) as any;
  if (json?.errors && Object.keys(json.errors).length) {
    const msg = JSON.stringify(json.errors);
    if (msg !== "[]" && msg !== "{}") return { ok: false, reason: msg };
  }
  return { ok: true, data: (json?.response ?? json) as T };
}

export type AfFixture = {
  fixture: {
    id: number;
    date: string;
    timezone: string;
    venue: { name: string | null };
    status: { short: string; elapsed: number | null };
  };
  league: {
    id: number;
    name: string;
    season: number;
    round: string | null;
    logo: string | null;
  };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
};

export async function afFetchFixtures(
  leagueId: number,
  season: number,
  opts: { from?: string; to?: string; next?: number } = {},
): Promise<ApiFootballResult<AfFixture[]>> {
  const params = new URLSearchParams({
    league: String(leagueId),
    season: String(season),
  });
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.next) params.set("next", String(opts.next));
  return apiGet<AfFixture[]>(`/fixtures?${params.toString()}`);
}

export type AfOddsResponse = {
  fixture: { id: number };
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
  update: string;
};

export async function afFetchOdds(
  fixtureId: number,
): Promise<ApiFootballResult<AfOddsResponse[]>> {
  return apiGet<AfOddsResponse[]>(`/odds?fixture=${fixtureId}`);
}

export async function afFetchLiveFixtures(
  leagueId: number,
): Promise<ApiFootballResult<AfFixture[]>> {
  return apiGet<AfFixture[]>(`/fixtures?live=all&league=${leagueId}`);
}

export function afStatusToInternal(short: string): {
  status: "scheduled" | "live" | "halftime" | "finished" | "postponed" | "cancelled" | "abandoned";
  isLive: boolean;
} {
  // API-Football status codes: NS, TBD, 1H, HT, 2H, ET, BT, P, SUSP, INT, FT, AET, PEN, PST, CANC, ABD, AWD, WO, LIVE
  const s = short.toUpperCase();
  if (s === "NS" || s === "TBD") return { status: "scheduled", isLive: false };
  if (s === "HT") return { status: "halftime", isLive: true };
  if (["1H", "2H", "ET", "BT", "P", "LIVE", "SUSP", "INT"].includes(s))
    return { status: "live", isLive: true };
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(s))
    return { status: "finished", isLive: false };
  if (s === "PST") return { status: "postponed", isLive: false };
  if (s === "CANC") return { status: "cancelled", isLive: false };
  if (s === "ABD") return { status: "abandoned", isLive: false };
  return { status: "scheduled", isLive: false };
}
