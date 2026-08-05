/**
 * House-edge / fairness regression suite.
 *
 * Pure-math guards that fail if anyone changes a payout table, multiplier
 * formula or coverage rule in a way that pushes RTP above 100% (a bankroll
 * bleed) or below the published floor (an unfair game).
 */
import { describe, it, expect } from "vitest";
import { returnMultiplier, POCKET_COUNT, THEORETICAL_RTP, ALLOWED_COVERAGE } from "@/lib/arcade/roulette-math";
import { survivalProbability, fairMultiplier, actualMultiplier, DEFAULT_TARGET_RTP } from "@/lib/arcade/treasure-math";
import { rpsOutcome, rpsMultiplier, RPS_MOVES } from "@/lib/arcade/rps-math";
import { roundMoney, roundLiability, potentialPayout } from "@/lib/accounting/money";

const RTP_CEILING = 1.0;

describe("roulette", () => {
  it("returns 36/37 RTP for every legal coverage", () => {
    for (const covered of ALLOWED_COVERAGE) {
      const rtp = (covered / POCKET_COUNT) * returnMultiplier(covered);
      expect(rtp).toBeCloseTo(THEORETICAL_RTP, 10);
      expect(rtp).toBeLessThanOrEqual(RTP_CEILING);
    }
  });

  it("has exactly 37 pockets (single zero)", () => {
    expect(POCKET_COUNT).toBe(37);
  });
});

describe("treasure grid", () => {
  const grids = [
    { n: 25, m: 3 },
    { n: 25, m: 5 },
    { n: 25, m: 8 },
  ];

  it("never pays above the target RTP at any reveal depth", () => {
    for (const { n, m } of grids) {
      for (let k = 1; k <= n - m; k++) {
        const p = survivalProbability(n, m, k);
        const rtp = p * actualMultiplier(n, m, k, DEFAULT_TARGET_RTP);
        expect(rtp).toBeLessThanOrEqual(RTP_CEILING + 1e-9);
        expect(rtp).toBeCloseTo(DEFAULT_TARGET_RTP, 6);
      }
    }
  });

  it("fair multiplier is the inverse of survival probability", () => {
    for (const { n, m } of grids) {
      for (let k = 1; k <= 5; k++) {
        expect(survivalProbability(n, m, k) * fairMultiplier(n, m, k)).toBeCloseTo(1, 9);
      }
    }
  });
});

describe("rock paper scissors", () => {
  it("resolves the classic 3x3 outcome matrix", () => {
    for (const p of RPS_MOVES) {
      for (const s of RPS_MOVES) {
        const o = rpsOutcome(p, s);
        if (p === s) expect(o).toBe("DRAW");
        else expect(["WIN", "LOSS"]).toContain(o);
      }
    }
    expect(rpsOutcome("ROCK", "SCISSORS")).toBe("WIN");
    expect(rpsOutcome("ROCK", "PAPER")).toBe("LOSS");
  });

  it("keeps round-level RTP below 100% and holds the ladder flat on a draw", () => {
    // Live config: win 1.9x on stake, draw returns the stake (ladder holds).
    const WIN = 1.9;
    const DRAW = 1.0;
    const win = rpsMultiplier("WIN", WIN, DRAW);
    const draw = rpsMultiplier("DRAW", WIN, DRAW);
    const loss = rpsMultiplier("LOSS", WIN, DRAW);
    const rtp = (win + draw + loss) / 3; // 1/3 win, 1/3 draw, 1/3 loss
    expect(rtp).toBeLessThan(RTP_CEILING);
    expect(draw).toBeLessThanOrEqual(1);
    expect(loss).toBe(0);
  });
});

describe("money policy", () => {
  it("rounds half-up away from zero at 2dp", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it("always rounds liability up so the house never under-reserves", () => {
    expect(roundLiability(1.001)).toBe(1.01);
    expect(roundLiability(2)).toBe(2);
  });

  it("computes payouts as stake x odds at 2dp", () => {
    expect(potentialPayout(119, 1.72)).toBe(204.68);
  });
});
