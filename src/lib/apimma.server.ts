// Server-only: API-Sports MMA (https://v1.mma.api-sports.io)
// Uses the same API_FOOTBALL_KEY (single API-Sports account key covers all
// subscribed APIs — MMA included).
//
// Free plan: 100 req/day, dates limited to last ~2 days. Real-time odds
// movement + live in-fight stats require an upgraded plan.
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
  category?: string | null;
  height?: string | null;
  weight?: string | null;
  reach?: string | null;
  stance?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  country?: string | null;
  photo?: string | null;
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
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`api-mma ${path} ${res.status}`);
  return (await res.json()) as ApiMmaResponse<T>;
}

export async function fetchFightsByDate(date: string) {
  const r = await apiMmaGet<ApiMmaFight[]>("/fights", { date });
  return r.response ?? [];
}

export async function fetchOddsForFight(fightId: number) {
  const r = await apiMmaGet<ApiMmaOddsResponse>("/odds", { fight: fightId });
  return r.response?.[0] ?? null;
}

export async function fetchFighter(id: number) {
  const r = await apiMmaGet<ApiMmaFighter[]>("/fighters", { id });
  return r.response?.[0] ?? null;
}

export async function fetchFighterRecords(id: number) {
  const r = await apiMmaGet<ApiMmaFighterRecord[]>("/fighters/records", { id });
  return r.response ?? [];
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
  const bare = v.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (bare) return Number(bare[1]);
  return null;
}
