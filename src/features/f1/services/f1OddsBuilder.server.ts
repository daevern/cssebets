// House odds builder for F1 markets (no native provider odds).
// Softmax over championship points, adjusted for qualifying grid.
// Adds fixed overround, floors, and caps.

export type OddsInput = {
  driverKey: string;
  points: number;
  gridPosition?: number | null; // 1..20; lower is better
};

export type OddsOutput = {
  driverKey: string;
  probability: number;
  fairOdds: number;
  offeredOdds: number;
};

const FLOOR = 1.05;
const CAP = 50.0;
const OVERROUND = 0.06; // 6% margin

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Softmax weighted by championship points; grid position biases result.
export function buildRaceWinnerOdds(inputs: OddsInput[]): OddsOutput[] {
  if (inputs.length === 0) return [];

  // Base weight from points (normalise so top ~10 has meaningful weight even early in season).
  const maxPts = Math.max(1, ...inputs.map((i) => i.points));
  const scores = inputs.map((i) => {
    const ptScore = (i.points / maxPts) * 3.0; // scale factor tuned for softmax
    const gridBoost = i.gridPosition != null
      ? clamp((11 - i.gridPosition) / 10, -1.0, 1.0) * 1.2
      : 0;
    return { key: i.driverKey, score: ptScore + gridBoost };
  });

  const exps = scores.map((s) => Math.exp(s.score));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);

  return scores.map((s, i) => {
    const p = probs[i];
    const fair = 1 / Math.max(p, 1e-6);
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return {
      driverKey: s.key,
      probability: p,
      fairOdds: fair,
      offeredOdds: Math.round(offered * 100) / 100,
    };
  });
}

// Podium probability approximation: sum of top-3 finish probs assuming inclusion-exclusion.
// Simple derivation: use race-winner probability as anchor and apply podium multiplier.
export function buildPodiumOdds(winnerOdds: OddsOutput[]): OddsOutput[] {
  return winnerOdds.map((w) => {
    const podiumP = clamp(w.probability * 2.6, 0.01, 0.95);
    const fair = 1 / podiumP;
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return { ...w, probability: podiumP, fairOdds: fair, offeredOdds: Math.round(offered * 100) / 100 };
  });
}

export function buildPointsOdds(winnerOdds: OddsOutput[]): OddsOutput[] {
  return winnerOdds.map((w) => {
    const pointsP = clamp(w.probability * 6.0, 0.02, 0.98);
    const fair = 1 / pointsP;
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return { ...w, probability: pointsP, fairOdds: fair, offeredOdds: Math.round(offered * 100) / 100 };
  });
}

// Top-5 finish probability — sits between podium (top-3) and points (top-10).
export function buildTop5Odds(winnerOdds: OddsOutput[]): OddsOutput[] {
  return winnerOdds.map((w) => {
    const p = clamp(w.probability * 4.2, 0.02, 0.97);
    const fair = 1 / p;
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return { ...w, probability: p, fairOdds: fair, offeredOdds: Math.round(offered * 100) / 100 };
  });
}

// Fastest lap — flatter than race winner (any driver can bolt on softs late).
export function buildFastestLapOdds(winnerOdds: OddsOutput[]): OddsOutput[] {
  const raw = winnerOdds.map((w) => Math.max(0.005, w.probability * 1.4 + 0.02));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return winnerOdds.map((w, i) => {
    const p = clamp(raw[i] / sum, 0.005, 0.6);
    const fair = 1 / p;
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return { ...w, probability: p, fairOdds: fair, offeredOdds: Math.round(offered * 100) / 100 };
  });
}

// Top constructor in the race — aggregate each team's driver win probabilities.
export function buildTopConstructorRaceOdds(
  teams: Array<{ teamKey: string; teamName: string; driverProbs: number[] }>,
): Array<{ teamKey: string; teamName: string; probability: number; offeredOdds: number }> {
  if (teams.length === 0) return [];
  // Team weight: sum of driver win probs, boosted (both drivers can score).
  const raw = teams.map((t) => t.driverProbs.reduce((a, b) => a + b, 0));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return teams.map((t, i) => {
    const p = clamp(raw[i] / sum, 0.01, 0.95);
    const fair = 1 / p;
    const offered = clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return {
      teamKey: t.teamKey,
      teamName: t.teamName,
      probability: p,
      offeredOdds: Math.round(offered * 100) / 100,
    };
  });
}

// Head-to-head between two drivers: probability one beats the other = pA / (pA + pB)
export function buildHeadToHeadOdds(
  a: { key: string; probability: number },
  b: { key: string; probability: number },
): { aOdds: number; bOdds: number } {
  const total = a.probability + b.probability;
  const pA = a.probability / total;
  const pB = b.probability / total;
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    aOdds: clamp(round((1 / pA) * (1 - OVERROUND)), FLOOR, CAP),
    bOdds: clamp(round((1 / pB) * (1 - OVERROUND)), FLOOR, CAP),
  };
}

// Championship outright odds based on current standings + races remaining.
export function buildChampionshipOdds(
  standings: Array<{ key: string; points: number }>,
  racesRemaining: number,
): OddsOutput[] {
  if (standings.length === 0) return [];
  const maxPts = Math.max(1, ...standings.map((s) => s.points));
  const leaderPts = standings[0]?.points ?? 0;

  const scores = standings.map((s, idx) => {
    const gap = leaderPts - s.points;
    // If gap > 25 * racesRemaining, mathematically eliminated.
    const eliminated = gap > 25 * Math.max(racesRemaining, 1);
    // Ranking-based weight: leader gets highest.
    const rankWeight = Math.max(0.2, 4 - idx * 0.5);
    const ptWeight = (s.points / maxPts) * 3;
    const closenessBoost = racesRemaining < 5 && idx === 0 ? 2 : 0;
    return {
      key: s.key,
      score: eliminated ? -10 : ptWeight + rankWeight + closenessBoost,
      eliminated,
    };
  });

  const exps = scores.map((s) => Math.exp(s.score));
  const sum = exps.reduce((a, b) => a + b, 0);
  return scores.map((s, i) => {
    const p = exps[i] / sum;
    const fair = 1 / Math.max(p, 1e-6);
    const offered = s.eliminated ? CAP : clamp(fair * (1 - OVERROUND), FLOOR, CAP);
    return {
      driverKey: s.key,
      probability: p,
      fairOdds: fair,
      offeredOdds: Math.round(offered * 100) / 100,
    };
  });
}
