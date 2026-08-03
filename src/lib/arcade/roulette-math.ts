/**
 * European Roulette — 37 pockets (0 + 1..36), every pocket equally likely (1/37).
 * Total-return multiplier = 36 / covered pockets  →  RTP 36/37 = 97.2973%,
 * house edge 1/37 = 2.7027% for every supported bet type.
 *
 * Pure, client-safe module. The server is the single source of truth for
 * outcomes; these helpers only describe the board and preview returns.
 */

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_POCKETS = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];
export const BLACK_POCKETS = [
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
];
export const POCKET_COUNT = 37;
export const THEORETICAL_RTP = 36 / 37;
export const THEORETICAL_HOUSE_EDGE = 1 / 37;

export type PocketColour = "green" | "red" | "black";

export function pocketColour(n: number): PocketColour {
  if (n === 0) return "green";
  return RED_POCKETS.includes(n) ? "red" : "black";
}

export type BetTypeKey =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "four_group"
  | "six_line"
  | "dozen"
  | "column"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

export const ALLOWED_COVERAGE = [1, 2, 3, 4, 6, 12, 18];

export function returnMultiplier(coveredCount: number): number {
  return Math.round((36 / coveredCount) * 10000) / 10000;
}

/** Net profit ratio, e.g. 35 for a straight (35:1). */
export function netProfitRatio(coveredCount: number): number {
  return returnMultiplier(coveredCount) - 1;
}

export function probability(coveredCount: number): number {
  return coveredCount / POCKET_COUNT;
}

/** RTP for any bet under the formula — always 36/37. */
export function rtpFor(coveredCount: number): number {
  return probability(coveredCount) * returnMultiplier(coveredCount);
}

/** Board grid used for split/corner adjacency: 12 rows × 3 columns. */
export const BOARD_GRID: number[][] = Array.from({ length: 12 }, (_, r) => [
  r * 3 + 1,
  r * 3 + 2,
  r * 3 + 3,
]);

/** Streets — the 12 horizontal rows of three. */
export const STREETS: number[][] = BOARD_GRID.map((row) => [...row]);

/** Six lines — two adjacent streets (non-overlapping presentation set). */
export const SIX_LINES: { label: string; pockets: number[] }[] = Array.from(
  { length: 6 },
  (_, i) => ({
    label: `${i * 6 + 1}–${i * 6 + 6}`,
    pockets: Array.from({ length: 6 }, (_, k) => i * 6 + 1 + k),
  }),
);

export const DOZENS: { label: string; pockets: number[] }[] = [
  { label: "1st 12", pockets: Array.from({ length: 12 }, (_, i) => i + 1) },
  { label: "2nd 12", pockets: Array.from({ length: 12 }, (_, i) => i + 13) },
  { label: "3rd 12", pockets: Array.from({ length: 12 }, (_, i) => i + 25) },
];

export const COLUMNS: { label: string; pockets: number[] }[] = [
  { label: "Col 1", pockets: Array.from({ length: 12 }, (_, i) => i * 3 + 1) },
  { label: "Col 2", pockets: Array.from({ length: 12 }, (_, i) => i * 3 + 2) },
  { label: "Col 3", pockets: Array.from({ length: 12 }, (_, i) => i * 3 + 3) },
];

export const LOW = Array.from({ length: 18 }, (_, i) => i + 1);
export const HIGH = Array.from({ length: 18 }, (_, i) => i + 19);
export const ODD = Array.from({ length: 18 }, (_, i) => i * 2 + 1);
export const EVEN = Array.from({ length: 18 }, (_, i) => i * 2 + 2);

export function areAdjacent(a: number, b: number): boolean {
  if (a === b) return false;
  if (a === 0 || b === 0) return false;
  const pos = (n: number) => {
    for (let r = 0; r < BOARD_GRID.length; r++) {
      const c = BOARD_GRID[r].indexOf(n);
      if (c >= 0) return { r, c };
    }
    return null;
  };
  const pa = pos(a);
  const pb = pos(b);
  if (!pa || !pb) return false;
  return Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c) === 1;
}

export type BetPosition = {
  id: string;
  bet_type: BetTypeKey;
  label: string;
  pockets: number[];
  stake: number;
};

export function positionKey(betType: BetTypeKey, pockets: number[]) {
  return `${betType}:${[...pockets].sort((a, b) => a - b).join("-")}`;
}

export function grossReturn(pos: BetPosition, winningPocket: number): number {
  if (!pos.pockets.includes(winningPocket)) return 0;
  return Math.round(pos.stake * returnMultiplier(pos.pockets.length) * 100) / 100;
}

export const BET_TYPE_TABLE: {
  key: BetTypeKey;
  label: string;
  covered: number;
}[] = [
  { key: "straight", label: "Straight number", covered: 1 },
  { key: "split", label: "Split", covered: 2 },
  { key: "street", label: "Street", covered: 3 },
  { key: "corner", label: "Corner", covered: 4 },
  { key: "six_line", label: "Six line", covered: 6 },
  { key: "dozen", label: "Dozen", covered: 12 },
  { key: "column", label: "Column", covered: 12 },
  { key: "red", label: "Red", covered: 18 },
  { key: "black", label: "Black", covered: 18 },
  { key: "odd", label: "Odd", covered: 18 },
  { key: "even", label: "Even", covered: 18 },
  { key: "low", label: "Low (1–18)", covered: 18 },
  { key: "high", label: "High (19–36)", covered: 18 },
];
