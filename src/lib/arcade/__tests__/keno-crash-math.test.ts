import { describe, expect, it } from "vitest";
import {
  CRASH_CAP,
  CRASH_HOUSE_EDGE,
  CRASH_MIN_CASHOUT,
  KENO_DRAWS,
  KENO_MAX_PICKS,
  KENO_POOL,
  KENO_RISKS,
  crashMultiplierAt,
  crashRtp,
  crashSecondsFor,
  crashSurvivalChance,
  kenoHitChance,
  kenoMaxMultiplier,
  kenoPaytable,
  kenoRtp,
  MINI_TARGET_RTP,
} from "@/lib/arcade/mini-math";

/** Deterministic PRNG so the simulations are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Keno published maths", () => {
  it("hit chances form a complete distribution for every ticket size", () => {
    for (let picks = 1; picks <= KENO_MAX_PICKS; picks++) {
      let total = 0;
      for (let hits = 0; hits <= picks; hits++) total += kenoHitChance(picks, hits);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it("never pays more than the published 96% RTP, on any risk or ticket size", () => {
    for (const risk of KENO_RISKS) {
      for (let picks = 1; picks <= KENO_MAX_PICKS; picks++) {
        const rtp = kenoRtp(risk, picks);
        expect(rtp).toBeLessThanOrEqual(MINI_TARGET_RTP + 0.0001);
        expect(rtp).toBeGreaterThan(MINI_TARGET_RTP - 0.01);
      }
    }
  });

  it("caps the top multiplier so the house liability stays bounded", () => {
    for (const risk of KENO_RISKS) {
      for (let picks = 1; picks <= KENO_MAX_PICKS; picks++) {
        expect(kenoMaxMultiplier(risk, picks)).toBeLessThanOrEqual(1000);
        expect(kenoPaytable(risk, picks).length).toBe(picks + 1);
      }
    }
  });

  it("simulated draws reproduce the published edge (200k tickets)", () => {
    const rnd = mulberry32(7);
    const picks = 5;
    const risk = "medium" as const;
    const table = kenoPaytable(risk, picks);
    const marked = [3, 11, 19, 27, 33];
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < 200_000; i++) {
      const pool = Array.from({ length: KENO_POOL }, (_, n) => n + 1);
      let len = pool.length;
      let hits = 0;
      for (let d = 0; d < KENO_DRAWS; d++) {
        const j = Math.floor(rnd() * len);
        const value = pool[j]!;
        pool[j] = pool[len - 1]!;
        len -= 1;
        if (marked.includes(value)) hits += 1;
      }
      staked += 1;
      returned += table[hits] ?? 0;
    }
    const rtp = returned / staked;
    expect(rtp).toBeGreaterThan(kenoRtp(risk, picks) - 0.06);
    expect(rtp).toBeLessThan(kenoRtp(risk, picks) + 0.06);
  });
});

describe("Crash published maths", () => {
  it("pays a flat 96% at every hold target", () => {
    for (const target of [1.2, 1.5, 2, 3, 5, 10, 25, 50, CRASH_CAP]) {
      expect(crashRtp(target)).toBeCloseTo(1 - CRASH_HOUSE_EDGE, 9);
    }
  });

  it("survival chance falls as the target rises", () => {
    expect(crashSurvivalChance(2)).toBeCloseTo(0.48, 9);
    expect(crashSurvivalChance(10)).toBeCloseTo(0.096, 9);
    expect(crashSurvivalChance(CRASH_MIN_CASHOUT)).toBeLessThan(1);
  });

  it("curve and its inverse agree", () => {
    for (const target of [1.5, 2, 4, 9, 40]) {
      const seconds = crashSecondsFor(target);
      expect(crashMultiplierAt(seconds)).toBeGreaterThanOrEqual(target - 0.01);
      expect(crashMultiplierAt(seconds)).toBeLessThanOrEqual(target + 0.01);
    }
  });

  it("simulated crash points match the published edge (300k runs)", () => {
    const rnd = mulberry32(21);
    const target = 2;
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < 300_000; i++) {
      const r = rnd();
      const crash = Math.max(
        1,
        Math.min(CRASH_CAP, Math.floor(((1 - CRASH_HOUSE_EDGE) / Math.max(1 - r, 1e-7)) * 100) / 100),
      );
      staked += 1;
      if (crash >= target) returned += target;
    }
    const rtp = returned / staked;
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(0.98);
  });

  it("never lets a run exceed the liability cap", () => {
    expect(crashMultiplierAt(10_000)).toBe(CRASH_CAP);
  });
});
