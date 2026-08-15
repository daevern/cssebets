import { describe, expect, it } from "vitest";
import {
  MINI_TARGET_RTP,
  POKER_PAYTABLE,
  TOWERS_DIFFICULTIES,
  TOWERS_ROWS,
  evaluatePokerHand,
  pokerCardFace,
  towersLadder,
  towersMultiplierAt,
  towersRtp,
  towersSafeChance,
  towersStepMultiplier,
  type TowersDifficulty,
} from "@/lib/arcade/mini-math";

const DIFFS = Object.keys(TOWERS_DIFFICULTIES) as TowersDifficulty[];

/** rank index 0 = Two … 12 = Ace, suit 0–3 — the server's card encoding. */
const card = (rank: number, suit: number) => rank * 4 + suit;

describe("Dragon Towers maths", () => {
  it("prices every published difficulty at the 96% house target", () => {
    for (const d of DIFFS) {
      for (let rows = 1; rows <= TOWERS_ROWS; rows++) {
        // Uncapped rows must return exactly the target RTP compounded.
        const uncapped = towersMultiplierAt(d, rows, MINI_TARGET_RTP, Number.POSITIVE_INFINITY);
        const expected = Math.pow(MINI_TARGET_RTP / towersSafeChance(d), rows);
        expect(uncapped).toBeCloseTo(expected, 2);
      }
    }
  });

  it("never returns more than the target RTP over a full climb", () => {
    for (const d of DIFFS) {
      for (let rows = 1; rows <= TOWERS_ROWS; rows++) {
        expect(towersRtp(d, rows)).toBeLessThanOrEqual(MINI_TARGET_RTP + 1e-6);
      }
    }
  });

  it("mirrors the server step formula rtp * tiles / safe tiles", () => {
    for (const d of DIFFS) {
      const { tiles, dragons } = TOWERS_DIFFICULTIES[d];
      expect(towersStepMultiplier(d)).toBeCloseTo(
        (MINI_TARGET_RTP * tiles) / (tiles - dragons),
        4,
      );
    }
  });

  it("produces a strictly rising, capped ladder", () => {
    for (const d of DIFFS) {
      const ladder = towersLadder(d);
      expect(ladder).toHaveLength(TOWERS_ROWS);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i]!).toBeGreaterThanOrEqual(ladder[i - 1]!);
        expect(ladder[i]!).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe("Video Poker evaluator", () => {
  it("classifies every published category", () => {
    // 10 J Q K A of one suit → ranks 8..12
    expect(evaluatePokerHand([8, 9, 10, 11, 12].map((r) => card(r, 0)))).toBe("royal_flush");
    expect(evaluatePokerHand([3, 4, 5, 6, 7].map((r) => card(r, 1)))).toBe("straight_flush");
    expect(evaluatePokerHand([card(5, 0), card(5, 1), card(5, 2), card(5, 3), card(1, 0)])).toBe(
      "four",
    );
    expect(evaluatePokerHand([card(5, 0), card(5, 1), card(5, 2), card(1, 0), card(1, 1)])).toBe(
      "full_house",
    );
    expect(evaluatePokerHand([card(0, 2), card(3, 2), card(6, 2), card(9, 2), card(12, 2)])).toBe(
      "flush",
    );
    expect(evaluatePokerHand([card(4, 0), card(5, 1), card(6, 2), card(7, 3), card(8, 0)])).toBe(
      "straight",
    );
    expect(evaluatePokerHand([card(7, 0), card(7, 1), card(7, 2), card(2, 0), card(11, 1)])).toBe(
      "three",
    );
    expect(evaluatePokerHand([card(7, 0), card(7, 1), card(3, 2), card(3, 0), card(11, 1)])).toBe(
      "two_pair",
    );
    expect(evaluatePokerHand([card(9, 0), card(9, 1), card(2, 2), card(5, 0), card(11, 1)])).toBe(
      "jacks_or_better",
    );
    // a pair of tens (rank 8) is below jacks and must not pay
    expect(evaluatePokerHand([card(8, 0), card(8, 1), card(2, 2), card(5, 0), card(11, 1)])).toBe(
      "nothing",
    );
  });

  it("reads the ace-low wheel as a straight", () => {
    // A 2 3 4 5 → ranks 12,0,1,2,3
    expect(evaluatePokerHand([card(12, 0), card(0, 1), card(1, 2), card(2, 3), card(3, 0)])).toBe(
      "straight",
    );
  });

  it("caps the paytable at the published royal flush", () => {
    const top = Math.max(...Object.values(POKER_PAYTABLE));
    expect(top).toBe(POKER_PAYTABLE.royal_flush);
    expect(top).toBe(250);
  });

  it("maps server card codes onto renderable faces", () => {
    expect(pokerCardFace(card(12, 3))).toEqual({ rank: 1, suit: 3 }); // Ace
    expect(pokerCardFace(card(0, 0))).toEqual({ rank: 2, suit: 0 }); // Two
    expect(pokerCardFace(card(11, 2))).toEqual({ rank: 13, suit: 2 }); // King
  });
});
