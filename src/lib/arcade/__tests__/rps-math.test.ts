import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import {
  moveFromDigest,
  rpsGrossReturn,
  rpsHmacInput,
  rpsMultiplier,
  rpsOutcome,
  RPS_MOVES,
} from "@/lib/arcade/rps-math";

// Node's WebCrypto so the browser helpers can be exercised here too.
if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;

describe("rps outcome table", () => {
  it("resolves the classic cycle", () => {
    expect(rpsOutcome("ROCK", "SCISSORS")).toBe("WIN");
    expect(rpsOutcome("PAPER", "ROCK")).toBe("WIN");
    expect(rpsOutcome("SCISSORS", "PAPER")).toBe("WIN");
    expect(rpsOutcome("SCISSORS", "ROCK")).toBe("LOSS");
    expect(rpsOutcome("ROCK", "PAPER")).toBe("LOSS");
    expect(rpsOutcome("PAPER", "SCISSORS")).toBe("LOSS");
  });

  it("treats identical moves as a draw", () => {
    for (const m of RPS_MOVES) expect(rpsOutcome(m, m)).toBe("DRAW");
  });
});

describe("rps payouts", () => {
  it("pays the win multiplier, refunds a draw and zeroes a loss", () => {
    expect(rpsMultiplier("WIN", 1.9, 1)).toBe(1.9);
    expect(rpsMultiplier("DRAW", 1.9, 1)).toBe(1);
    expect(rpsMultiplier("LOSS", 1.9, 1)).toBe(0);
  });

  it("rounds gross return to 2dp like the database", () => {
    expect(rpsGrossReturn(33, 1.9)).toBe(62.7);
    expect(rpsGrossReturn(7, 1.9)).toBe(13.3);
    expect(rpsGrossReturn(10, 0)).toBe(0);
  });

  it("never returns more than the stake on a draw", () => {
    expect(rpsGrossReturn(50, rpsMultiplier("DRAW", 1.9, 1))).toBe(50);
  });
});

describe("rps move derivation", () => {
  it("maps the first byte below 255 onto a move", () => {
    expect(moveFromDigest(new Uint8Array([0]))).toBe("ROCK");
    expect(moveFromDigest(new Uint8Array([1]))).toBe("PAPER");
    expect(moveFromDigest(new Uint8Array([2]))).toBe("SCISSORS");
    expect(moveFromDigest(new Uint8Array([3]))).toBe("ROCK");
  });

  it("rejects 255 so the mapping stays unbiased", () => {
    expect(moveFromDigest(new Uint8Array([255, 1]))).toBe("PAPER");
    expect(moveFromDigest(new Uint8Array([255, 255, 2]))).toBe("SCISSORS");
  });

  it("is uniform across a large digest sample", () => {
    const counts: Record<string, number> = { ROCK: 0, PAPER: 0, SCISSORS: 0 };
    for (let b = 0; b < 255; b++) counts[moveFromDigest(new Uint8Array([b]))]++;
    expect(counts.ROCK).toBe(85);
    expect(counts.PAPER).toBe(85);
    expect(counts.SCISSORS).toBe(85);
  });

  it("builds the same HMAC message the server signs", () => {
    expect(rpsHmacInput("abc", 4, "round-1")).toBe("abc:4:round-1");
  });
});
