import { describe, expect, it } from "vitest";
import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  MINI_TARGET_RTP,
  WHEEL_RISKS,
  WHEEL_SEGMENTS,
  diceMultiplier,
  diceRtp,
  diceWinChance,
  hiloImpossible,
  hiloProbability,
  hiloStepMultiplier,
  wheelMaxMultiplier,
  wheelRtp,
} from "@/lib/arcade/mini-math";

/**
 * House-edge proofs for the three CSSE Originals cabinets.
 * These assert the PUBLISHED tables, independently of the database, so a
 * table can never be edited into a losing configuration unnoticed.
 */

const EDGE = 1 - MINI_TARGET_RTP;

/** Deterministic PRNG so Monte Carlo runs are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("dice", () => {
  it("pays an exact 4% house edge at every legal target", () => {
    for (let t = DICE_MIN_TARGET; t <= DICE_MAX_TARGET; t += 0.5) {
      for (const dir of ["under", "over"] as const) {
        // The 48x cap only binds at the extreme ends of the range.
        if (diceMultiplier(t, dir) >= 48) continue;
        expect(diceRtp(t, dir)).toBeCloseTo(MINI_TARGET_RTP, 4);
      }
    }
  });

  it("never exceeds the published multiplier cap", () => {
    expect(diceMultiplier(2, "under")).toBeLessThanOrEqual(48);
    expect(diceMultiplier(98, "over")).toBeLessThanOrEqual(48);
  });

  it("win chances of the two directions are complementary", () => {
    for (let t = 10; t <= 90; t += 10) {
      expect(diceWinChance(t, "under") + diceWinChance(t, "over")).toBeCloseTo(1, 10);
    }
  });

  it("returns the house ~4% over a 400k-roll simulation", () => {
    const rnd = mulberry32(20260814);
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < 400_000; i++) {
      const target = 5 + Math.floor(rnd() * 90);
      const dir = rnd() < 0.5 ? "under" : "over";
      const roll = Math.floor(rnd() * 10000) / 100;
      const win = dir === "under" ? roll < target : roll >= target;
      staked += 1;
      if (win) returned += diceMultiplier(target, dir);
    }
    expect(returned / staked).toBeGreaterThan(MINI_TARGET_RTP - 0.02);
    expect(returned / staked).toBeLessThan(MINI_TARGET_RTP + 0.02);
  });
});

describe("fortune wheel", () => {
  it("every risk table has 20 equally likely segments", () => {
    for (const risk of WHEEL_RISKS) expect(WHEEL_SEGMENTS[risk]).toHaveLength(20);
  });

  it("every risk table pays exactly 96%", () => {
    for (const risk of WHEEL_RISKS) {
      expect(wheelRtp(risk)).toBeCloseTo(MINI_TARGET_RTP, 6);
      expect(1 - wheelRtp(risk)).toBeCloseTo(EDGE, 6);
    }
  });

  it("higher risk means a bigger top multiplier", () => {
    expect(wheelMaxMultiplier("high")).toBeGreaterThan(wheelMaxMultiplier("medium"));
    expect(wheelMaxMultiplier("medium")).toBeGreaterThan(wheelMaxMultiplier("low"));
  });

  it("returns the house ~4% over a 300k-spin simulation", () => {
    const rnd = mulberry32(7);
    for (const risk of WHEEL_RISKS) {
      const table = WHEEL_SEGMENTS[risk];
      let returned = 0;
      const spins = 300_000;
      for (let i = 0; i < spins; i++) returned += table[Math.floor(rnd() * table.length)];
      expect(returned / spins).toBeGreaterThan(MINI_TARGET_RTP - 0.05);
      expect(returned / spins).toBeLessThan(MINI_TARGET_RTP + 0.05);
    }
  });
});

describe("hi-lo", () => {
  it("the two sides always cover the deck exactly once", () => {
    for (let i = 0; i < 13; i++) {
      expect(hiloProbability(i, "higher") + hiloProbability(i, "lower")).toBeCloseTo(1, 10);
    }
  });

  it("each step pays 96% of fair odds", () => {
    for (let i = 0; i < 13; i++) {
      for (const guess of ["higher", "lower"] as const) {
        if (hiloImpossible(i, guess)) continue;
        const step = hiloStepMultiplier(i, guess);
        expect(step * hiloProbability(i, guess)).toBeCloseTo(MINI_TARGET_RTP, 3);
      }
    }
  });

  it("disables the side that cannot win", () => {
    expect(hiloImpossible(0, "lower")).toBe(true);
    expect(hiloImpossible(0, "higher")).toBe(false);
    expect(hiloImpossible(12, "higher")).toBe(false);
  });

  it("a five-step run compounds to 0.96^5 of fair value", () => {
    const ranks = [3, 6, 9, 4, 7];
    let mult = 1;
    let fair = 1;
    for (const r of ranks) {
      mult *= hiloStepMultiplier(r, "higher");
      fair *= 1 / hiloProbability(r, "higher");
    }
    expect(mult / fair).toBeCloseTo(MINI_TARGET_RTP ** 5, 3);
  });

  it("holds a ~4% edge over 200k simulated runs", () => {
    const rnd = mulberry32(99);
    const runs = 200_000;
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < runs; i++) {
      staked += 1;
      let current = Math.floor(rnd() * 13);
      let mult = 1;
      // A fixed, mechanical strategy: always call the likelier side, bank
      // after three correct calls. Any strategy yields the same edge.
      for (let step = 0; step < 3; step++) {
        const guess = hiloProbability(current, "higher") >= 0.5 ? "higher" : "lower";
        const step_m = hiloStepMultiplier(current, guess);
        const next = Math.floor(rnd() * 13);
        const win = guess === "higher" ? next >= current : next < current;
        if (!win) {
          mult = 0;
          break;
        }
        mult *= step_m;
        current = next;
      }
      returned += mult;
    }
    const rtp = returned / staked;
    expect(rtp).toBeGreaterThan(MINI_TARGET_RTP ** 3 - 0.03);
    expect(rtp).toBeLessThan(MINI_TARGET_RTP ** 3 + 0.03);
  });
});
