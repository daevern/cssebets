/**
 * Treasure Grid — pure probability helpers.
 *
 * N = total tiles, M = traps, S = N - M safe tiles, k = safe tiles revealed.
 *   P(k) = product_{i=0..k-1} (S - i) / (N - i)
 *   fair multiplier   = 1 / P(k)
 *   actual multiplier = fair * targetRtp     (truncated to 8dp, capped)
 *   gross return      = floor(stake * actual)   -> integer virtual points
 *
 * The server is the single source of truth: these helpers only preview and
 * describe the published tables. They must never be used to submit a payout.
 */

export type TreasureDifficulty = "easy" | "medium" | "hard";

export const DEFAULT_TARGET_RTP = 0.96;

/** Survival probability after k safe reveals. */
export function survivalProbability(n: number, m: number, k: number): number {
  const s = n - m;
  if (k < 0 || k > s) throw new Error("INVALID_REVEAL_COUNT");
  let p = 1;
  for (let i = 0; i < k; i++) p *= (s - i) / (n - i);
  return p;
}

/** Mathematically fair total-return multiplier after k safe reveals. */
export function fairMultiplier(n: number, m: number, k: number): number {
  return 1 / survivalProbability(n, m, k);
}

/** RTP-adjusted total-return multiplier (includes the original stake). */
export function actualMultiplier(
  n: number,
  m: number,
  k: number,
  targetRtp = DEFAULT_TARGET_RTP,
  maxMultiplier = 5000,
): number {
  const raw = fairMultiplier(n, m, k) * targetRtp;
  const truncated = Math.trunc(raw * 1e8) / 1e8;
  return Math.min(Math.max(truncated, 1), maxMultiplier);
}

/** Integer virtual-point return. Always rounds down. */
export function grossReturn(stake: number, multiplier: number): number {
  return Math.floor(stake * multiplier);
}

/** Theoretical platform edge for a published RTP. */
export function platformEdge(targetRtp = DEFAULT_TARGET_RTP): number {
  return 1 - targetRtp;
}

export const DIFFICULTY_META: Record<
  TreasureDifficulty,
  { label: string; traps: number; blurb: string }
> = {
  easy: { label: "Easy", traps: 3, blurb: "3 traps · 22 safe · gentle climb" },
  medium: { label: "Medium", traps: 5, blurb: "5 traps · 20 safe · balanced" },
  hard: { label: "Hard", traps: 8, blurb: "8 traps · 17 safe · steep climb" },
};
