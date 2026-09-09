/**
 * Fantasy XI scoring rules — pure functions so they can be unit tested and
 * reused by both the sync job and the UI ("how points work" panel).
 */

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";

export type FantasyStatLine = {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesMissed: number;
  penaltiesSaved: number;
};

export const GOAL_POINTS: Record<FantasyPosition, number> = {
  GK: 6,
  DEF: 6,
  MID: 5,
  FWD: 4,
};

export const CLEAN_SHEET_POINTS: Record<FantasyPosition, number> = {
  GK: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
};

export const SQUAD_SIZE = 11;
export const BUDGET = 100;
export const MAX_PER_CLUB = 3;

/** Allowed outfield shapes (a goalkeeper is always the 11th player). */
export const FORMATIONS: Record<string, { DEF: number; MID: number; FWD: number }> = {
  "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
  "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
  "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
  "3-4-3": { DEF: 3, MID: 4, FWD: 3 },
  "5-3-2": { DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { DEF: 5, MID: 4, FWD: 1 },
  "4-5-1": { DEF: 4, MID: 5, FWD: 1 },
};

export function scorePlayer(position: FantasyPosition, s: FantasyStatLine): number {
  if (s.minutes <= 0) return 0;
  let pts = s.minutes >= 60 ? 2 : 1;

  pts += s.goals * GOAL_POINTS[position];
  pts += s.assists * 3;

  if (s.cleanSheet && s.minutes >= 60) pts += CLEAN_SHEET_POINTS[position];

  if (position === "GK" || position === "DEF") {
    pts -= Math.floor(s.goalsConceded / 2);
  }
  if (position === "GK") {
    pts += Math.floor(s.saves / 3);
    pts += s.penaltiesSaved * 5;
  }

  pts -= s.yellowCards * 1;
  pts -= s.redCards * 3;
  pts -= s.ownGoals * 2;
  pts -= s.penaltiesMissed * 2;

  return pts;
}

/** Prize split of the round pool, top three. */
export const PRIZE_SPLIT = [0.5, 0.3, 0.2];

export function prizeFor(rank: number, pool: number, entrants: number): number {
  if (pool <= 0 || rank < 1) return 0;
  if (entrants === 1) return rank === 1 ? pool : 0;
  if (entrants === 2) return rank === 1 ? pool * 0.7 : rank === 2 ? pool * 0.3 : 0;
  const share = PRIZE_SPLIT[rank - 1] ?? 0;
  return Math.round(pool * share * 100) / 100;
}

export type SquadPickInput = {
  playerId: string;
  position: FantasyPosition;
  price: number;
  teamProviderId: number;
};

export function validateSquad(
  picks: SquadPickInput[],
  formation: string,
  captainId: string,
  viceId: string,
): { ok: true; spend: number } | { ok: false; reason: string } {
  const shape = FORMATIONS[formation];
  if (!shape) return { ok: false, reason: "Pick a valid formation." };
  if (picks.length !== SQUAD_SIZE) return { ok: false, reason: "Your team needs 11 players." };

  const ids = new Set(picks.map((p) => p.playerId));
  if (ids.size !== picks.length) return { ok: false, reason: "You picked the same player twice." };

  const count = (pos: FantasyPosition) => picks.filter((p) => p.position === pos).length;
  if (count("GK") !== 1) return { ok: false, reason: "Pick exactly one goalkeeper." };
  if (count("DEF") !== shape.DEF || count("MID") !== shape.MID || count("FWD") !== shape.FWD) {
    return { ok: false, reason: `That squad doesn't match a ${formation} shape.` };
  }

  const perClub = new Map<number, number>();
  for (const p of picks) {
    const n = (perClub.get(p.teamProviderId) ?? 0) + 1;
    if (n > MAX_PER_CLUB) return { ok: false, reason: `Maximum ${MAX_PER_CLUB} players from one club.` };
    perClub.set(p.teamProviderId, n);
  }

  const spend = Math.round(picks.reduce((sum, p) => sum + Number(p.price), 0) * 10) / 10;
  if (spend > BUDGET) return { ok: false, reason: `You are ${(spend - BUDGET).toFixed(1)}m over budget.` };

  if (!ids.has(captainId)) return { ok: false, reason: "Pick a captain from your eleven." };
  if (!ids.has(viceId)) return { ok: false, reason: "Pick a vice-captain from your eleven." };
  if (captainId === viceId) return { ok: false, reason: "Captain and vice-captain must differ." };

  return { ok: true, spend };
}
