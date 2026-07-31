/**
 * Mini Roulette — 13 pockets (0 + 1..12), every pocket equally likely (1/13).
 * Total-return multiplier = 12 / covered pockets  →  RTP 12/13 = 92.3077%,
 * house edge 1/13 = 7.6923% for every supported bet type.
 *
 * Pure, client-safe module. The server is the single source of truth for
 * outcomes; these helpers only describe the board and preview returns.
 */

export const WHEEL_ORDER = [0, 1, 2, 3, 4, 5, 6, 8, 7, 10, 9, 12, 11] as const;
export const RED_POCKETS = [1, 3, 5, 8, 10, 12];
export const BLACK_POCKETS = [2, 4, 6, 7, 9, 11];
export const POCKET_COUNT = 13;
export const THEORETICAL_RTP = 12 / 13;
export const THEORETICAL_HOUSE_EDGE = 1 / 13;

export type PocketColour = "green" | "red" | "black";

export function pocketColour(n: number): PocketColour {
  if (n === 0) return "green";
  return RED_POCKETS.includes(n) ? "red" : "black";
}

export type BetTypeKey =
  | "straight"
  | "split"
  | "street"
  | "four_group"
  | "column"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

export const ALLOWED_COVERAGE = [1, 2, 3, 4, 6];

export function returnMultiplier(coveredCount: number): number {
  return Math.round((12 / coveredCount) * 10000) / 10000;
}

/** Net profit ratio, e.g. 11 for a straight (11:1). */
export function netProfitRatio(coveredCount: number): number {
  return returnMultiplier(coveredCount) - 1;
}

export function probability(coveredCount: number): number {
  return coveredCount / POCKET_COUNT;
}

/** RTP for any bet under the formula — always 12/13. */
export function rtpFor(coveredCount: number): number {
  return probability(coveredCount) * returnMultiplier(coveredCount);
}

export const STREETS: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
];

export const FOUR_GROUPS: { label: string; pockets: number[] }[] = [
  { label: "1st Group", pockets: [1, 2, 3, 4] },
  { label: "2nd Group", pockets: [5, 6, 7, 8] },
  { label: "3rd Group", pockets: [9, 10, 11, 12] },
];

export const COLUMNS: { label: string; pockets: number[] }[] = [
  { label: "Col 1", pockets: [1, 4, 7, 10] },
  { label: "Col 2", pockets: [2, 5, 8, 11] },
  { label: "Col 3", pockets: [3, 6, 9, 12] },
];

export const LOW = [1, 2, 3, 4, 5, 6];
export const HIGH = [7, 8, 9, 10, 11, 12];
export const ODD = [1, 3, 5, 7, 9, 11];
export const EVEN = [2, 4, 6, 8, 10, 12];

/** Board grid used for split adjacency: 4 rows × 3 columns. */
export const BOARD_GRID: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
];

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
  { key: "four_group", label: "Four-number group", covered: 4 },
  { key: "column", label: "Column", covered: 4 },
  { key: "red", label: "Red", covered: 6 },
  { key: "black", label: "Black", covered: 6 },
  { key: "odd", label: "Odd", covered: 6 },
  { key: "even", label: "Even", covered: 6 },
  { key: "low", label: "Low (1–6)", covered: 6 },
  { key: "high", label: "High (7–12)", covered: 6 },
];
