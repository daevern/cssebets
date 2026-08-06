/**
 * Arcade configuration registry — the single client-safe source of truth for
 * what each *published configuration version* of an arcade product pays.
 *
 * Why this file exists
 * --------------------
 * Every arcade product is versioned (`public.arcade_config_versions`) and each
 * environment (PRODUCTION / SIMULATION / TEST) is pinned to exactly one version
 * (`public.arcade_config_activation`). The database is authoritative for what a
 * round actually pays; this module mirrors those published tables so that:
 *
 *   - the UI can label a screen with the *resolved* version for the current
 *     environment instead of a hardcoded "1.9x";
 *   - a historical round can be rendered with the version stored ON THE ROUND;
 *   - the regression suite can assert v1 and v2 independently, by explicitly
 *     passing a version rather than reading whatever happens to be active.
 *
 * Nothing here is ever used to submit or accept a payout.
 */

export type ArcadeProduct = "plinko" | "rps" | "blackjack";
export type ConfigVersion = 1 | 2;
export type PlinkoRisk = "low" | "medium" | "high";
export type PlinkoRows = 8 | 10 | 12 | 14 | 16;

/* ------------------------------------------------------------------ */
/* Rock–Paper–Scissors                                                 */
/* ------------------------------------------------------------------ */

export type RpsConfig = {
  version: ConfigVersion;
  winMultiplier: number;
  drawMultiplier: number;
  lossMultiplier: 0;
  /** Published theoretical RTP over the uniform 1/3–1/3–1/3 outcome space. */
  targetRtp: number;
  targetHouseEdge: number;
};

export const RPS_CONFIGS: Record<ConfigVersion, RpsConfig> = {
  1: {
    version: 1,
    winMultiplier: 1.9,
    drawMultiplier: 1.0,
    lossMultiplier: 0,
    targetRtp: 2.9 / 3,
    targetHouseEdge: 1 - 2.9 / 3,
  },
  2: {
    version: 2,
    winMultiplier: 1.85,
    drawMultiplier: 1.0,
    lossMultiplier: 0,
    targetRtp: 0.95,
    targetHouseEdge: 0.05,
  },
};

/** Exact RTP of an RPS configuration (win/draw/loss are equiprobable). */
export function rpsRtp(version: ConfigVersion): number {
  const c = RPS_CONFIGS[version];
  return (c.winMultiplier + c.drawMultiplier + c.lossMultiplier) / 3;
}

export function rpsHouseEdge(version: ConfigVersion): number {
  return 1 - rpsRtp(version);
}

/* ------------------------------------------------------------------ */
/* Plinko                                                              */
/* ------------------------------------------------------------------ */

type PlinkoTable = Record<PlinkoRisk, number[]>;

/** Published multiplier tables, indexed by version → rows → risk. */
export const PLINKO_TABLES: Record<ConfigVersion, Record<PlinkoRows, PlinkoTable>> = {
  1: {
    8: {
      low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    },
    10: {
      low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
      medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
      high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    },
    12: {
      low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    14: {
      low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
      medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
      high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
    },
    16: {
      low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  },
  2: {
    8: {
      low: [5.43, 2.04, 1.07, 0.97, 0.4814, 0.97, 1.07, 2.04, 5.43],
      medium: [12.6, 2.91, 1.26, 0.68, 0.3897, 0.68, 1.26, 2.91, 12.6],
      high: [28.1, 3.88, 1.45, 0.29, 0.1971, 0.29, 1.45, 3.88, 28.1],
    },
    10: {
      low: [8.63, 2.91, 1.36, 1.07, 0.97, 0.4801, 0.97, 1.07, 1.36, 2.91, 8.63],
      medium: [21.4, 4.85, 1.94, 1.36, 0.58, 0.3914, 0.58, 1.36, 1.94, 4.85, 21.4],
      high: [73.7, 9.69, 2.91, 0.87, 0.29, 0.1958, 0.29, 0.87, 2.91, 9.69, 73.7],
    },
    12: {
      low: [9.7, 2.91, 1.55, 1.36, 1.07, 0.97, 0.4807, 0.97, 1.07, 1.36, 1.55, 2.91, 9.7],
      medium: [32, 10.7, 3.88, 1.94, 1.07, 0.58, 0.2896, 0.58, 1.07, 1.94, 3.88, 10.7, 32],
      high: [165, 23.2, 7.85, 1.94, 0.68, 0.19, 0.1963, 0.19, 0.68, 1.94, 7.85, 23.2, 165],
    },
    14: {
      low: [
        6.88, 3.88, 1.84, 1.36, 1.26, 1.07, 0.97, 0.4804, 0.97, 1.07, 1.26, 1.36, 1.84, 3.88, 6.88,
      ],
      medium: [56.2, 14.5, 6.79, 3.88, 1.84, 0.97, 0.48, 0.2038, 0.48, 0.97, 1.84, 3.88, 6.79, 14.5, 56.2],
      high: [407, 54.3, 17.5, 4.85, 1.84, 0.29, 0.19, 0.2018, 0.19, 0.29, 1.84, 4.85, 17.5, 54.3, 407],
    },
    16: {
      low: [
        15.5, 8.73, 1.94, 1.36, 1.36, 1.16, 1.07, 0.97, 0.4818, 0.97, 1.07, 1.16, 1.36, 1.36, 1.94,
        8.73, 15.5,
      ],
      medium: [
        107, 39.8, 9.7, 4.85, 2.91, 1.45, 0.97, 0.48, 0.3022, 0.48, 0.97, 1.45, 2.91, 4.85, 9.7,
        39.8, 107,
      ],
      high: [
        970, 126, 25.2, 8.73, 3.88, 1.94, 0.19, 0.19, 0.2063, 0.19, 0.19, 1.94, 3.88, 8.73, 25.2,
        126, 970,
      ],
    },
  },
};

export const PLINKO_TARGETS: Record<ConfigVersion, { targetRtp: number; targetHouseEdge: number }> =
  {
    1: { targetRtp: 0.99, targetHouseEdge: 0.01 },
    2: { targetRtp: 0.96, targetHouseEdge: 0.04 },
  };

/** Binomial slot probabilities for an n-row pin pyramid (fair 50/50 pegs). */
export function plinkoSlotProbabilities(rows: number): number[] {
  const probs: number[] = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) {
    probs.push(c / 2 ** rows);
    c = (c * (rows - k)) / (k + 1);
  }
  return probs;
}

/** Exact RTP of a published Plinko table. */
export function plinkoRtp(rows: PlinkoRows, risk: PlinkoRisk, version: ConfigVersion): number {
  const table = PLINKO_TABLES[version][rows][risk];
  const probs = plinkoSlotProbabilities(rows);
  return table.reduce((acc, m, i) => acc + m * probs[i], 0);
}

export function plinkoMaxMultiplier(
  rows: PlinkoRows,
  risk: PlinkoRisk,
  version: ConfigVersion,
): number {
  return Math.max(...PLINKO_TABLES[version][rows][risk]);
}

export const PLINKO_ROWS: PlinkoRows[] = [8, 10, 12, 14, 16];
export const PLINKO_RISKS: PlinkoRisk[] = ["low", "medium", "high"];

/* ------------------------------------------------------------------ */
/* Blackjack                                                           */
/* ------------------------------------------------------------------ */

export type BlackjackRuleset = {
  version: ConfigVersion;
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  doubleRule: "any_two" | "9_11" | "10_11" | "11_only";
  maxSplitHands: number;
  resplitAces: boolean;
  surrender: boolean;
  dealerPeek: boolean;
  blackjackPayout: "3:2" | "4:3" | "6:5";
  /** Measured basic-strategy figures (see docs/accounting/phase11-*.md). */
  measuredHouseEdge: number;
  measuredRtp: number;
  simulatedHands: number;
};

export const BLACKJACK_RULESETS: Record<ConfigVersion, BlackjackRuleset> = {
  1: {
    version: 1,
    decks: 6,
    dealerHitsSoft17: true,
    doubleAfterSplit: true,
    doubleRule: "any_two",
    maxSplitHands: 4,
    resplitAces: false,
    surrender: false,
    dealerPeek: true,
    blackjackPayout: "3:2",
    measuredHouseEdge: 0.006202,
    measuredRtp: 0.993798,
    simulatedHands: 20_000_000,
  },
  2: {
    version: 2,
    decks: 6,
    dealerHitsSoft17: true,
    doubleAfterSplit: false,
    doubleRule: "any_two",
    maxSplitHands: 4,
    resplitAces: false,
    surrender: false,
    dealerPeek: true,
    blackjackPayout: "4:3",
    measuredHouseEdge: 0.015095,
    measuredRtp: 0.984905,
    simulatedHands: 20_000_000,
  },
};

export function blackjackPayoutRatio(version: ConfigVersion): number {
  const [n, d] = BLACKJACK_RULESETS[version].blackjackPayout.split(":").map(Number);
  return n / d;
}

/** Player-facing rule bullets, resolved from the ruleset (never hardcoded). */
export function blackjackRuleBullets(version: ConfigVersion): string[] {
  const r = BLACKJACK_RULESETS[version];
  return [
    `${r.decks} decks`,
    r.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on all 17s",
    r.doubleAfterSplit ? "Double after split allowed" : "Double after split unavailable",
    r.doubleRule === "any_two"
      ? "Double on any two cards"
      : `Double on ${r.doubleRule.replace("_", "–").replace("11_only", "11")} only`,
    `Split up to ${r.maxSplitHands} hands`,
    r.resplitAces ? "Resplit aces allowed" : "Aces split once, one card each",
    r.dealerPeek ? "Dealer peeks for blackjack" : "No dealer peek",
    `Blackjack pays ${r.blackjackPayout}`,
  ];
}

/* ------------------------------------------------------------------ */
/* Shared payout / liability helpers (version-parameterised)           */
/* ------------------------------------------------------------------ */

/** Gross return of an RPS round under an explicit version. */
export function rpsGrossReturnFor(
  stake: number,
  outcome: "WIN" | "DRAW" | "LOSS",
  version: ConfigVersion,
): number {
  const c = RPS_CONFIGS[version];
  const m = outcome === "WIN" ? c.winMultiplier : outcome === "DRAW" ? c.drawMultiplier : 0;
  return Math.round(stake * m * 100) / 100;
}

/** Worst-case exposure the house must reserve for one round of a product. */
export function maxPayoutFor(
  product: ArcadeProduct,
  stake: number,
  version: ConfigVersion,
  opts?: { rows?: PlinkoRows; risk?: PlinkoRisk },
): number {
  if (product === "rps") return Math.ceil(stake * RPS_CONFIGS[version].winMultiplier * 100) / 100;
  if (product === "plinko") {
    const rows = opts?.rows ?? 16;
    const risk = opts?.risk ?? "high";
    return Math.ceil(stake * plinkoMaxMultiplier(rows, risk, version) * 100) / 100;
  }
  // Blackjack worst case: split to N hands, each doubled, each winning 2:1 of
  // the doubled bet, or a natural paying the published ratio on one hand.
  const r = BLACKJACK_RULESETS[version];
  const splitWorstCase = stake * r.maxSplitHands * 2 * 2;
  const naturalWorstCase = stake * (1 + blackjackPayoutRatio(version));
  return Math.ceil(Math.max(splitWorstCase, naturalWorstCase) * 100) / 100;
}
