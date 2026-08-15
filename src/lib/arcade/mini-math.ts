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

export type MiniProduct = "hilo" | "dice" | "wheel" | "keno" | "crash" | "towers" | "poker";
export type WheelRisk = "low" | "medium" | "high";
export type KenoRisk = "classic" | "medium" | "high";
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

/* ------------------------------------------------------------------ */
/* Keno                                                                */
/* ------------------------------------------------------------------ */

export const KENO_POOL = 40;
export const KENO_DRAWS = 10;
export const KENO_MAX_PICKS = 10;
export const KENO_RISKS: KenoRisk[] = ["classic", "medium", "high"];

/**
 * Published Keno paytables — index = hits, value = multiplier on the stake.
 * Must stay byte-identical to `arcade_mini_configs.payload->'paytables'`.
 */
export const KENO_PAYTABLES: Record<KenoRisk, Record<number, number[]>> = {
  classic: {
    1: [0, 3.84],
    2: [0, 1.67, 5.44],
    3: [0, 0, 5.02, 22.5],
    4: [0, 0, 2.62, 7.52, 43.8],
    5: [0, 0, 0, 7.66, 28.4, 209],
    6: [0, 0, 0, 4.24, 11.9, 56, 517],
    7: [0, 0, 0, 0, 12.9, 46.1, 271, 1000],
    8: [0, 0, 0, 0, 7.18, 20.9, 93.6, 695, 1000],
    9: [0, 0, 0, 0, 0, 23.5, 86, 486, 1000, 1000],
    10: [0, 0, 0, 0, 0, 13, 40.6, 188, 1000, 1000, 1000],
  },
  medium: {
    1: [0, 3.84],
    2: [0, 0, 16.6],
    3: [0, 0, 4.27, 31],
    4: [0, 0, 0, 15.2, 157],
    5: [0, 0, 0, 0, 64.2, 900],
    6: [0, 0, 0, 0, 23.2, 179, 1000],
    7: [0, 0, 0, 0, 0, 104, 1000, 1000],
    8: [0, 0, 0, 0, 0, 41.6, 302, 1000, 1000],
    9: [0, 0, 0, 0, 0, 0, 245, 1000, 1000, 1000],
    10: [0, 0, 0, 0, 0, 0, 84, 637, 1000, 1000, 1000],
  },
  high: {
    1: [0, 3.84],
    2: [0, 0, 16.6],
    3: [0, 0, 0, 79],
    4: [0, 0, 0, 0, 417],
    5: [0, 0, 0, 0, 60.2, 1000],
    6: [0, 0, 0, 0, 0, 459, 1000],
    7: [0, 0, 0, 0, 0, 104, 1000, 1000],
    8: [0, 0, 0, 0, 0, 34.3, 384, 1000, 1000],
    9: [0, 0, 0, 0, 0, 0, 245, 1000, 1000, 1000],
    10: [0, 0, 0, 0, 0, 0, 68.9, 815, 1000, 1000, 1000],
  },
};

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Chance of exactly `hits` matches when `picks` numbers are marked. */
export function kenoHitChance(picks: number, hits: number): number {
  return (
    (choose(picks, hits) * choose(KENO_POOL - picks, KENO_DRAWS - hits)) /
    choose(KENO_POOL, KENO_DRAWS)
  );
}

export function kenoPaytable(risk: KenoRisk, picks: number): number[] {
  return KENO_PAYTABLES[risk][picks] ?? [0];
}

/** Exact expected return of one Keno ticket, per point staked. */
export function kenoRtp(risk: KenoRisk, picks: number): number {
  return kenoPaytable(risk, picks).reduce((a, m, hits) => a + m * kenoHitChance(picks, hits), 0);
}

export function kenoMaxMultiplier(risk: KenoRisk, picks: number): number {
  return Math.max(...kenoPaytable(risk, picks));
}

/* ------------------------------------------------------------------ */
/* Crash                                                               */
/* ------------------------------------------------------------------ */

export const CRASH_HOUSE_EDGE = 0.04;
export const CRASH_GROWTH_PER_SECOND = 0.12;
export const CRASH_MIN_CASHOUT = 1.01;
export const CRASH_CAP = 100;

/** Multiplier shown at `seconds` into a run — mirrors the server clock. */
export function crashMultiplierAt(
  seconds: number,
  growth: number = CRASH_GROWTH_PER_SECOND,
  cap: number = CRASH_CAP,
): number {
  if (seconds <= 0) return 1;
  return Math.min(cap, Math.floor(Math.exp(growth * seconds) * 100) / 100);
}

/** Seconds the curve needs to reach `multiplier`. */
export function crashSecondsFor(
  multiplier: number,
  growth: number = CRASH_GROWTH_PER_SECOND,
): number {
  return Math.log(Math.max(multiplier, 1.0000001)) / growth;
}

/** Chance a run survives to `multiplier` — `(1 - edge) / multiplier`. */
export function crashSurvivalChance(
  multiplier: number,
  edge: number = CRASH_HOUSE_EDGE,
): number {
  if (multiplier <= 1) return 1;
  return Math.min(1, (1 - edge) / multiplier);
}

/** Expected return of holding for `multiplier`, per point staked. */
export function crashRtp(multiplier: number, edge: number = CRASH_HOUSE_EDGE): number {
  return crashSurvivalChance(multiplier, edge) * multiplier;
}

/* ------------------------------------------------------------------ */
/* Dragon Towers                                                       */
/* ------------------------------------------------------------------ */

export type TowersDifficulty = "easy" | "medium" | "hard" | "nightmare";

/** Published tower shapes — must match `arcade_mini_configs.payload`. */
export const TOWERS_DIFFICULTIES: Record<
  TowersDifficulty,
  { tiles: number; dragons: number; label: string }
> = {
  easy: { tiles: 4, dragons: 1, label: "Easy" },
  medium: { tiles: 3, dragons: 1, label: "Medium" },
  hard: { tiles: 2, dragons: 1, label: "Hard" },
  nightmare: { tiles: 4, dragons: 3, label: "Nightmare" },
};

export const TOWERS_ROWS = 8;
export const TOWERS_MAX_MULTIPLIER = 500;

export function towersSafeChance(difficulty: TowersDifficulty): number {
  const d = TOWERS_DIFFICULTIES[difficulty];
  return (d.tiles - d.dragons) / d.tiles;
}

/** One safe row multiplies the running total by this — mirrors the DB. */
export function towersStepMultiplier(
  difficulty: TowersDifficulty,
  rtp: number = MINI_TARGET_RTP,
): number {
  const d = TOWERS_DIFFICULTIES[difficulty];
  return Math.round((rtp * d.tiles) / (d.tiles - d.dragons) * 10000) / 10000;
}

/** Running multiplier after `rows` safe picks, capped like the server. */
export function towersMultiplierAt(
  difficulty: TowersDifficulty,
  rows: number,
  rtp: number = MINI_TARGET_RTP,
  cap: number = TOWERS_MAX_MULTIPLIER,
): number {
  if (rows <= 0) return 1;
  const step = towersStepMultiplier(difficulty, rtp);
  return Math.min(cap, Math.round(Math.pow(step, rows) * 10000) / 10000);
}

/** Full ladder for the UI, row 1 … row 8. */
export function towersLadder(difficulty: TowersDifficulty): number[] {
  return Array.from({ length: TOWERS_ROWS }, (_, i) => towersMultiplierAt(difficulty, i + 1));
}

/** Expected return of climbing exactly `rows` rows then banking. */
export function towersRtp(difficulty: TowersDifficulty, rows: number): number {
  return Math.pow(towersSafeChance(difficulty), rows) * towersMultiplierAt(difficulty, rows);
}

/* ------------------------------------------------------------------ */
/* Video Poker — Jacks or Better                                       */
/* ------------------------------------------------------------------ */

export type PokerCategory =
  | "royal_flush"
  | "straight_flush"
  | "four"
  | "full_house"
  | "flush"
  | "straight"
  | "three"
  | "two_pair"
  | "jacks_or_better"
  | "nothing";

/** Published paytable — must match `arcade_mini_configs.payload->'paytable'`. */
export const POKER_PAYTABLE: Record<PokerCategory, number> = {
  royal_flush: 250,
  straight_flush: 50,
  four: 25,
  full_house: 7,
  flush: 5,
  straight: 4,
  three: 3,
  two_pair: 2,
  jacks_or_better: 1,
  nothing: 0,
};

export const POKER_CATEGORY_LABELS: Record<PokerCategory, string> = {
  royal_flush: "Royal flush",
  straight_flush: "Straight flush",
  four: "Four of a kind",
  full_house: "Full house",
  flush: "Flush",
  straight: "Straight",
  three: "Three of a kind",
  two_pair: "Two pair",
  jacks_or_better: "Jacks or better",
  nothing: "No pay",
};

/** Paytable rows in display order, richest first. */
export const POKER_PAY_ROWS: PokerCategory[] = [
  "royal_flush",
  "straight_flush",
  "four",
  "full_house",
  "flush",
  "straight",
  "three",
  "two_pair",
  "jacks_or_better",
];

/** Card code 0–51 → rank index 0 = Two … 12 = Ace (server encoding). */
export function pokerRank(card: number): number {
  return Math.floor(card / 4);
}

export function pokerSuit(card: number): number {
  return card % 4;
}

/**
 * Server card code → the `{ rank, suit }` pair `PlayingCard` renders
 * (1 = Ace, 11 = Jack, 12 = Queen, 13 = King).
 */
export function pokerCardFace(card: number): { rank: number; suit: number } {
  const r = pokerRank(card);
  return { rank: r === 12 ? 1 : r + 2, suit: pokerSuit(card) };
}

/**
 * Client mirror of `public.arcade_poker_eval`. Display only — the server
 * classifies the hand that actually pays.
 */
export function evaluatePokerHand(cards: number[]): PokerCategory {
  if (cards.length !== 5) return "nothing";
  const ranks = cards.map(pokerRank).sort((a, b) => a - b);
  const suits = cards.map(pokerSuit);
  const flush = suits.every((s) => s === suits[0]);
  const distinct = new Set(ranks);
  const wheel = distinct.size === 5 && ranks[0] === 0 && ranks[3] === 3 && ranks[4] === 12;
  const straight = distinct.size === 5 && (ranks[4]! - ranks[0]! === 4 || wheel);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  let pairs = 0;
  let trips = false;
  let quads = false;
  let highPair = false;
  for (const [rank, n] of counts) {
    if (n === 4) quads = true;
    if (n === 3) trips = true;
    if (n === 2) {
      pairs += 1;
      if (rank >= 9) highPair = true;
    }
  }

  if (flush && straight && ranks[0] === 8) return "royal_flush";
  if (flush && straight) return "straight_flush";
  if (quads) return "four";
  if (trips && pairs === 1) return "full_house";
  if (flush) return "flush";
  if (straight) return "straight";
  if (trips) return "three";
  if (pairs === 2) return "two_pair";
  if (pairs === 1 && highPair) return "jacks_or_better";
  return "nothing";
}
