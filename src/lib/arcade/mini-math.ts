/**
 * CSSE Originals — Hi-Lo, Dice and Fortune Wheel published maths.
 *
 * Client-safe mirror of the database configuration (`arcade_mini_configs`)
 * and of the resolution functions (`arcade_dice_multiplier`,
 * `arcade_hilo_prob`, wheel segment tables).
 *
 * NOTHING here decides a payout. The server derives every result from a
 * committed seed and pays from `arcade_mini_close`. These helpers exist so
 * the UI can label odds correctly and so the regression suite can prove the
 * published house edge independently of the database.
 */

export type MiniProduct = "hilo" | "dice" | "wheel";
export type WheelRisk = "low" | "medium" | "high";
export type DiceDirection = "under" | "over";
export type HiloGuess = "higher" | "lower";

/** Published target RTP for all three cabinets (4.00% house edge). */
export const MINI_TARGET_RTP = 0.96;

/* ------------------------------------------------------------------ */
/* Dice                                                                */
/* ------------------------------------------------------------------ */

export const DICE_MIN_TARGET = 2;
export const DICE_MAX_TARGET = 98;
export const DICE_MAX_MULTIPLIER = 48;

/** Win probability of a dice bet. Rolls are uniform over 0.00–99.99. */
export function diceWinChance(target: number, direction: DiceDirection): number {
  return direction === "under" ? target / 100 : (100 - target) / 100;
}

/** Published multiplier, matching `public.arcade_dice_multiplier`. */
export function diceMultiplier(
  target: number,
  direction: DiceDirection,
  rtp: number = MINI_TARGET_RTP,
  cap: number = DICE_MAX_MULTIPLIER,
): number {
  const denominator = direction === "under" ? target : 100 - target;
  return Math.min(cap, Math.round((rtp * 100 * 10000) / denominator) / 10000);
}

/** Exact expected return of one dice bet, per point staked. */
export function diceRtp(target: number, direction: DiceDirection): number {
  return diceMultiplier(target, direction) * diceWinChance(target, direction);
}

/* ------------------------------------------------------------------ */
/* Fortune Wheel                                                       */
/* ------------------------------------------------------------------ */

/** Published segment tables — must stay identical to the DB payload. */
export const WHEEL_SEGMENTS: Record<WheelRisk, number[]> = {
  low: [1.2, 0.2, 1.2, 1.5, 1.2, 0.2, 1.2, 1.5, 1.2, 0.2, 1.2, 1.5, 1.2, 0.2, 1.2, 1.5, 1.2, 0.2, 1.2, 0.2],
  medium: [1.8, 0, 1.0, 0, 4.0, 0, 1.0, 0, 1.8, 0, 1.0, 0, 4.0, 0, 1.0, 0, 1.8, 0, 1.8, 0],
  high: [15, 0, 0, 0, 0, 2.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.1, 0, 0, 0, 0],
};

export const WHEEL_RISKS: WheelRisk[] = ["low", "medium", "high"];

/** Every segment is equally likely, so RTP is the plain mean. */
export function wheelRtp(risk: WheelRisk): number {
  const t = WHEEL_SEGMENTS[risk];
  return t.reduce((a, m) => a + m, 0) / t.length;
}

export function wheelMaxMultiplier(risk: WheelRisk): number {
  return Math.max(...WHEEL_SEGMENTS[risk]);
}

/* ------------------------------------------------------------------ */
/* Hi-Lo                                                               */
/* ------------------------------------------------------------------ */

export const HILO_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const HILO_SUITS = ["♠", "♥", "♦", "♣"];
export const HILO_MAX_MULTIPLIER = 25;

/**
 * Probability that the next card satisfies the guess.
 * "higher" means higher OR equal; "lower" means strictly lower — together
 * they cover the deck exactly once, so the two chances always sum to 1.
 */
export function hiloProbability(rankIndex: number, guess: HiloGuess): number {
  return guess === "higher" ? (13 - rankIndex) / 13 : rankIndex / 13;
}

/** Multiplier applied to the running total for one correct call. */
export function hiloStepMultiplier(
  rankIndex: number,
  guess: HiloGuess,
  rtp: number = MINI_TARGET_RTP,
): number {
  const p = hiloProbability(rankIndex, guess);
  if (p <= 0) return 0;
  return Math.round((rtp / p) * 10000) / 10000;
}

/** True when a side cannot possibly win and must be disabled in the UI. */
export function hiloImpossible(rankIndex: number, guess: HiloGuess): boolean {
  return hiloProbability(rankIndex, guess) <= 0;
}

export function hiloCardLabel(card: { rank: number; suit: number }): string {
  return `${HILO_RANKS[card.rank] ?? "?"}${HILO_SUITS[card.suit] ?? ""}`;
}

export function hiloIsRed(card: { suit: number }): boolean {
  return card.suit === 1 || card.suit === 2;
}
