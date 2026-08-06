/**
 * Version-explicit arcade configuration regression suite.
 *
 * Every assertion names the configuration version it is testing. Nothing in
 * this file reads "whichever version happens to be active" — that is the whole
 * point: v1 (PRODUCTION) and v2 (SIMULATION/TEST) must both stay correct while
 * they coexist, and a historical round must keep paying the version stored on
 * the round.
 */
import { describe, expect, it } from "vitest";
import {
  BLACKJACK_RULESETS,
  PLINKO_RISKS,
  PLINKO_ROWS,
  PLINKO_TABLES,
  PLINKO_TARGETS,
  RPS_CONFIGS,
  blackjackPayoutRatio,
  blackjackRuleBullets,
  maxPayoutFor,
  plinkoRtp,
  plinkoSlotProbabilities,
  rpsGrossReturnFor,
  rpsHouseEdge,
  rpsRtp,
  type ConfigVersion,
} from "@/lib/arcade/config-registry";
import { RPS_MOVES, rpsOutcome } from "@/lib/arcade/rps-math";
import { roundLiability, roundMoney } from "@/lib/accounting/money";

const pct = (x: number) => Math.round(x * 1_000_000) / 10_000; // percentage, 4dp

/* ================================================================== */
/* Rock–Paper–Scissors                                                 */
/* ================================================================== */

describe("RPS configuration v1", () => {
  const V: ConfigVersion = 1;

  it("pays 1.90x win / 1.00x draw / 0x loss", () => {
    expect(RPS_CONFIGS[V].winMultiplier).toBe(1.9);
    expect(RPS_CONFIGS[V].drawMultiplier).toBe(1.0);
    expect(RPS_CONFIGS[V].lossMultiplier).toBe(0);
  });

  it("has a 96.6667% RTP and a 3.3333% house edge", () => {
    expect(pct(rpsRtp(V))).toBeCloseTo(96.6667, 3);
    expect(pct(rpsHouseEdge(V))).toBeCloseTo(3.3333, 3);
  });

  it("resolves all nine player/server combinations correctly", () => {
    const stake = 100;
    let totalReturn = 0;
    for (const player of RPS_MOVES) {
      for (const server of RPS_MOVES) {
        const outcome = rpsOutcome(player, server);
        const ret = rpsGrossReturnFor(stake, outcome, V);
        if (outcome === "WIN") expect(ret).toBe(190);
        if (outcome === "DRAW") expect(ret).toBe(100);
        if (outcome === "LOSS") expect(ret).toBe(0);
        totalReturn += ret;
      }
    }
    // 3 wins, 3 draws, 3 losses across the 3x3 matrix.
    expect(totalReturn / (9 * stake)).toBeCloseTo(rpsRtp(V), 12);
  });
});

describe("RPS configuration v2", () => {
  const V: ConfigVersion = 2;

  it("pays 1.85x win / 1.00x draw / 0x loss", () => {
    expect(RPS_CONFIGS[V].winMultiplier).toBe(1.85);
    expect(RPS_CONFIGS[V].drawMultiplier).toBe(1.0);
    expect(RPS_CONFIGS[V].lossMultiplier).toBe(0);
  });

  it("has a 95.0000% RTP and a 5.0000% house edge", () => {
    expect(pct(rpsRtp(V))).toBeCloseTo(95.0, 4);
    expect(pct(rpsHouseEdge(V))).toBeCloseTo(5.0, 4);
  });

  it("resolves all nine player/server combinations correctly", () => {
    const stake = 100;
    let totalReturn = 0;
    for (const player of RPS_MOVES) {
      for (const server of RPS_MOVES) {
        const outcome = rpsOutcome(player, server);
        const ret = rpsGrossReturnFor(stake, outcome, V);
        if (outcome === "WIN") expect(ret).toBe(185);
        if (outcome === "DRAW") expect(ret).toBe(100);
        if (outcome === "LOSS") expect(ret).toBe(0);
        totalReturn += ret;
      }
    }
    expect(totalReturn / (9 * stake)).toBeCloseTo(0.95, 12);
  });
});

describe("RPS versions are independent", () => {
  it("v1 and v2 never resolve to the same payout for a win", () => {
    expect(rpsGrossReturnFor(50, "WIN", 1)).toBe(95);
    expect(rpsGrossReturnFor(50, "WIN", 2)).toBe(92.5);
  });

  it("a draw holds the ladder flat in both versions", () => {
    for (const v of [1, 2] as ConfigVersion[]) {
      expect(rpsGrossReturnFor(77, "DRAW", v)).toBe(77);
    }
  });
});

/* ================================================================== */
/* Plinko — every rows/risk table, per version                         */
/* ================================================================== */

describe("Plinko slot probabilities", () => {
  it("sums to 1 for every supported row count", () => {
    for (const rows of PLINKO_ROWS) {
      const sum = plinkoSlotProbabilities(rows).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });
});

describe("Plinko configuration v1", () => {
  for (const rows of PLINKO_ROWS) {
    for (const risk of PLINKO_RISKS) {
      it(`${rows} rows / ${risk} keeps RTP under 100% and near the v1 target`, () => {
        const rtp = plinkoRtp(rows, risk, 1);
        expect(rtp).toBeLessThanOrEqual(1);
        expect(rtp).toBeGreaterThan(0.97);
        expect(PLINKO_TABLES[1][rows][risk].length).toBe(rows + 1);
      });
    }
  }

  it("is symmetric around the centre slot", () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const t = PLINKO_TABLES[1][rows][risk];
        for (let i = 0; i < t.length; i++) expect(t[i]).toBe(t[t.length - 1 - i]);
      }
    }
  });
});

describe("Plinko configuration v2", () => {
  for (const rows of PLINKO_ROWS) {
    for (const risk of PLINKO_RISKS) {
      it(`${rows} rows / ${risk} pays exactly 96.00% RTP`, () => {
        const rtp = plinkoRtp(rows, risk, 2);
        expect(pct(rtp)).toBeCloseTo(96.0, 1); // within 0.05pp of target
        expect(rtp).toBeLessThanOrEqual(1);
        expect(PLINKO_TABLES[2][rows][risk].length).toBe(rows + 1);
      });
    }
  }

  it("has a 4.00% house edge target", () => {
    expect(PLINKO_TARGETS[2].targetHouseEdge).toBe(0.04);
  });

  it("is symmetric around the centre slot", () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const t = PLINKO_TABLES[2][rows][risk];
        for (let i = 0; i < t.length; i++) expect(t[i]).toBe(t[t.length - 1 - i]);
      }
    }
  });

  it("has a strictly lower RTP than v1 for every table (house-favourable rescale)", () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        expect(plinkoRtp(rows, risk, 2)).toBeLessThan(plinkoRtp(rows, risk, 1));
      }
    }
  });
});

/* ================================================================== */
/* Blackjack v1 / v2                                                   */
/* ================================================================== */

describe("Blackjack configuration v1", () => {
  const r = BLACKJACK_RULESETS[1];

  it("is the legacy 6D H17 DAS ruleset paying 3:2", () => {
    expect(r.decks).toBe(6);
    expect(r.dealerHitsSoft17).toBe(true);
    expect(r.doubleAfterSplit).toBe(true);
    expect(r.blackjackPayout).toBe("3:2");
    expect(blackjackPayoutRatio(1)).toBeCloseTo(1.5, 12);
  });

  it("has a measured basic-strategy edge near 0.62%", () => {
    expect(pct(r.measuredHouseEdge)).toBeGreaterThan(0.55);
    expect(pct(r.measuredHouseEdge)).toBeLessThan(0.7);
  });

  it("pays a natural at 3:2", () => {
    expect(roundMoney(100 * (1 + blackjackPayoutRatio(1)))).toBe(250);
  });
});

describe("Blackjack configuration v2", () => {
  const r = BLACKJACK_RULESETS[2];

  it("is 6D H17, no DAS, paying 4:3", () => {
    expect(r.decks).toBe(6);
    expect(r.dealerHitsSoft17).toBe(true);
    expect(r.doubleAfterSplit).toBe(false);
    expect(r.blackjackPayout).toBe("4:3");
    expect(blackjackPayoutRatio(2)).toBeCloseTo(4 / 3, 12);
  });

  it("has a measured basic-strategy edge inside the 1.40–1.60% band", () => {
    expect(pct(r.measuredHouseEdge)).toBeGreaterThanOrEqual(1.4);
    expect(pct(r.measuredHouseEdge)).toBeLessThanOrEqual(1.6);
  });

  it("pays a natural at 4:3", () => {
    expect(roundMoney(90 * (1 + blackjackPayoutRatio(2)))).toBe(210);
  });

  it("exposes every required player-facing rule bullet", () => {
    const bullets = blackjackRuleBullets(2).join(" | ");
    expect(bullets).toContain("6 decks");
    expect(bullets).toContain("Dealer hits soft 17");
    expect(bullets).toContain("Double after split unavailable");
    expect(bullets).toContain("Split up to 4 hands");
    expect(bullets).toContain("Blackjack pays 4:3");
  });
});

/* ================================================================== */
/* Liability, max payout and settlement — per version                  */
/* ================================================================== */

describe("maximum payout and liability reservation", () => {
  it("reserves the version's win multiplier for RPS", () => {
    expect(maxPayoutFor("rps", 100, 1)).toBe(190);
    expect(maxPayoutFor("rps", 100, 2)).toBe(185);
  });

  it("reserves the version's top multiplier for Plinko 16/high", () => {
    expect(maxPayoutFor("plinko", 10, 1, { rows: 16, risk: "high" })).toBe(10000);
    expect(maxPayoutFor("plinko", 10, 2, { rows: 16, risk: "high" })).toBe(9700);
  });

  it("reserves the split/double worst case for Blackjack in both versions", () => {
    expect(maxPayoutFor("blackjack", 25, 1)).toBe(400);
    expect(maxPayoutFor("blackjack", 25, 2)).toBe(400);
  });

  it("always rounds liability up", () => {
    expect(roundLiability(maxPayoutFor("rps", 33.33, 2))).toBe(61.67);
  });
});

describe("settlement arithmetic", () => {
  it("nets stake against gross return per version", () => {
    const stake = 40;
    expect(roundMoney(rpsGrossReturnFor(stake, "WIN", 1) - stake)).toBe(36);
    expect(roundMoney(rpsGrossReturnFor(stake, "WIN", 2) - stake)).toBe(34);
    expect(roundMoney(rpsGrossReturnFor(stake, "DRAW", 2) - stake)).toBe(0);
    expect(roundMoney(rpsGrossReturnFor(stake, "LOSS", 2) - stake)).toBe(-40);
  });

  it("settles a Plinko drop using the table of the version stored on the round", () => {
    const settle = (stake: number, slot: number, version: ConfigVersion) =>
      roundMoney(stake * PLINKO_TABLES[version][16].high[slot]);
    expect(settle(10, 0, 1)).toBe(10000);
    expect(settle(10, 0, 2)).toBe(9700);
  });
});

/* ================================================================== */
/* Provably fair historical replay — pinned to the round's version     */
/* ================================================================== */

describe("historical replay uses the version stored on the round", () => {
  type Round = { stake: number; outcome: "WIN" | "DRAW" | "LOSS"; configVersion: ConfigVersion };

  const history: Round[] = [
    { stake: 100, outcome: "WIN", configVersion: 1 },
    { stake: 100, outcome: "WIN", configVersion: 2 },
    { stake: 60, outcome: "DRAW", configVersion: 1 },
    { stake: 60, outcome: "LOSS", configVersion: 2 },
  ];

  it("replays each round against its own configuration, not the active one", () => {
    const replayed = history.map((r) => rpsGrossReturnFor(r.stake, r.outcome, r.configVersion));
    expect(replayed).toEqual([190, 185, 60, 0]);
  });

  it("does not change when the 'active' version flips", () => {
    for (const activeVersion of [1, 2] as ConfigVersion[]) {
      // The active version is deliberately unused by the replay path.
      void activeVersion;
      const replayed = history.map((r) => rpsGrossReturnFor(r.stake, r.outcome, r.configVersion));
      expect(replayed).toEqual([190, 185, 60, 0]);
    }
  });

  it("replays a Plinko drop against the table pinned on the round", () => {
    const round = { stake: 5, slot: 0, rows: 12 as const, risk: "high" as const, configVersion: 1 as ConfigVersion };
    expect(roundMoney(round.stake * PLINKO_TABLES[round.configVersion][round.rows][round.risk][round.slot])).toBe(850);
    const v2Round = { ...round, configVersion: 2 as ConfigVersion };
    expect(roundMoney(v2Round.stake * PLINKO_TABLES[2][12].high[0])).toBe(825);
  });
});
