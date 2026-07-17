// Server-only: API-Sports Formula-1 (https://v1.formula-1.api-sports.io)
// Uses the same API_FOOTBALL_KEY (single API-Sports account key covers F1).
import { withRetry } from "@/features/football/services/retry";

const BASE = "https://v1.formula-1.api-sports.io";

export type F1Response<T> = {
  get: string;
  parameters: Record<string, unknown>;
  errors: unknown;
  results: number;
  paging?: { current: number; total: number };
  response: T;
};

export type F1Race = {
  id: number;
  competition: { id: number; name: string; location: { country: string; city: string } };
  circuit: { id: number; name: string; image: string };
  season: number;
  type: string; // "Race" | "1st Qualifying" etc
  laps?: { total: number | null; current: number | null };
  fastest_lap?: unknown;
  distance?: string;
  timezone?: string;
  date: string;
  weather?: unknown;
  status: string;
};

export type F1DriverRow = {
  driver: {
    id: number;
    name: string;
    abbr?: string;
    number?: number;
    image?: string;
    nationality?: string;
  };
  team: { id: number; name: string; logo?: string };
  position?: number | null;
  points?: number | null;
  season?: number;
};

export type F1TeamRow = {
  team: { id: number; name: string; logo?: string };
  position?: number | null;
  points?: number | null;
  season?: number;
};

export type F1RaceResultRow = {
  race?: { id: number };
  driver: { id: number; name: string; image?: string };
  team: { id: number; name: string };
  position?: number | null;
  time?: string;
  grid?: number | null;
  laps?: number | null;
  pits?: number | null;
  gap?: string | null;
  points?: number | null;
};

async function f1Get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<F1Response<T>> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) throw new Error("API_FOOTBALL_KEY not set");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": key, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`api-f1 ${path} HTTP ${res.status}`);
    return (await res.json()) as F1Response<T>;
  });
}

export async function fetchF1Races(season: number) {
  const r = await f1Get<F1Race[]>("/races", { season });
  return r.response ?? [];
}

export async function fetchF1DriverStandings(season: number) {
  const r = await f1Get<F1DriverRow[]>("/rankings/drivers", { season });
  return r.response ?? [];
}

export async function fetchF1TeamStandings(season: number) {
  const r = await f1Get<F1TeamRow[]>("/rankings/teams", { season });
  return r.response ?? [];
}

export async function fetchF1RaceResults(raceId: number) {
  const r = await f1Get<F1RaceResultRow[]>("/rankings/races", { race: raceId });
  return r.response ?? [];
}

export async function fetchF1FastestLap(raceId: number) {
  const r = await f1Get<Array<{ driver: { id: number; name: string }; time?: string; position?: number | null }>>(
    "/rankings/fastestlaps",
    { race: raceId },
  );
  return r.response ?? [];
}

export async function fetchF1Drivers(season: number) {
  const r = await f1Get<Array<{ id: number; name: string; abbr?: string; number?: number; nationality?: string; teams?: Array<{ team: { id: number; name: string } }>; image?: string }>>(
    "/drivers",
    { season },
  );
  return r.response ?? [];
}

export async function fetchF1Teams(season: number) {
  const r = await f1Get<Array<{ id: number; name: string; logo?: string }>>("/teams", { season });
  return r.response ?? [];
}
