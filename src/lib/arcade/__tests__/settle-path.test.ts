/**
 * Settle-path regressions for seven arcade products.
 * Locks gross/net identities against published multipliers — no live DB.
 */
import { describe, expect, it } from "vitest";
import {
  assertSettleIdentity,
  settleMultiplierRound,
  settleTreasureRound,
} from "@/lib/arcade/settle-path";
import { diceMultiplier } from "@/lib/arcade/mini-math";
import { hiloStepMultiplier } from "@/lib/arcade/mini-math";
import { WHEEL_SEGMENTS } from "@/lib/arcade/mini-math";
import { kenoPaytable, crashMultiplierAt, CRASH_MIN_CASHOUT } from "@/lib/arcade/mini-math";
import { returnMultiplier, grossReturn as rouletteGross } from "@/lib/arcade/roulette-math";
import { actualMultiplier } from "@/lib/arcade/treasure-math";
import { roundMoney } from "@/lib/accounting/money";

describe("arcade settle-path — dice", () => {
  it("winning under-50 roll pays published multiplier net of stake", () => {
    const stake = 25;
    const mult = diceMultiplier(50, "under");
    const settled = settleMultiplierRound(stake, mult);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
    expect(settled.grossReturn).toBe(roundMoney(stake * mult));
    expect(settled.userNet).toBe(roundMoney(settled.grossReturn - stake));
  });

  it("miss settles at 0× — player loses the stake", () => {
    const settled = settleMultiplierRound(10, 0);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("LOSS");
    expect(settled.grossReturn).toBe(0);
    expect(settled.userNet).toBe(-10);
  });
});

describe("arcade settle-path — hi-lo", () => {
  it("one correct higher call compounds and banks as WIN", () => {
    const stake = 20;
    const step = hiloStepMultiplier(6, "higher"); // mid deck
    const settled = settleMultiplierRound(stake, step);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
    expect(settled.userNet).toBeGreaterThan(0);
  });

  it("wrong call settles LOSS at 0×", () => {
    const settled = settleMultiplierRound(20, 0);
    expect(settled.outcome).toBe("LOSS");
    expect(settled.userNet).toBe(-20);
  });
});

describe("arcade settle-path — fortune wheel", () => {
  it("lands on a ≥1× segment as WIN", () => {
    const stake = 15;
    const mult = Math.max(...WHEEL_SEGMENTS.medium.filter((m) => m >= 1));
    const settled = settleMultiplierRound(stake, mult);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
  });

  it("0× and sub-1× segments are LOSS (even if residual return)", () => {
    const zero = settleMultiplierRound(15, 0);
    expect(zero.outcome).toBe("LOSS");
    expect(zero.userNet).toBe(-15);

    const partial = settleMultiplierRound(15, 0.2);
    assertSettleIdentity(partial);
    expect(partial.outcome).toBe("LOSS");
    expect(partial.grossReturn).toBe(3);
    expect(partial.userNet).toBe(roundMoney(3 - 15));
  });
});

describe("arcade settle-path — keno", () => {
  it("paytable hit settles WIN when multiplier ≥ 1", () => {
    const stake = 10;
    const table = kenoPaytable("medium", 5);
    const top = Math.max(...table);
    const settled = settleMultiplierRound(stake, top);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
    expect(settled.grossReturn).toBe(roundMoney(stake * top));
  });

  it("zero-hit ticket settles LOSS", () => {
    const table = kenoPaytable("medium", 5);
    const settled = settleMultiplierRound(10, table[0] ?? 0);
    assertSettleIdentity(settled);
    if ((table[0] ?? 0) < 1) expect(settled.outcome).toBe("LOSS");
  });
});

describe("arcade settle-path — crash", () => {
  it("cashout at/above min multiplier is WIN", () => {
    const stake = 50;
    const mult = Math.max(CRASH_MIN_CASHOUT, crashMultiplierAt(3));
    const settled = settleMultiplierRound(stake, mult);
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
    expect(settled.userNet).toBe(roundMoney(settled.grossReturn - stake));
  });

  it("bust before cashout is LOSS", () => {
    const settled = settleMultiplierRound(50, 0);
    expect(settled.outcome).toBe("LOSS");
    expect(settled.userNet).toBe(-50);
  });
});

describe("arcade settle-path — roulette", () => {
  it("straight hit pays 36× gross identity", () => {
    const stake = 5;
    const mult = returnMultiplier(1);
    expect(mult).toBeCloseTo(36, 8);
    const pos = {
      id: "s1",
      bet_type: "straight" as const,
      label: "17",
      pockets: [17],
      stake,
    };
    const gross = rouletteGross(pos, 17);
    const settled = settleMultiplierRound(stake, gross / stake);
    assertSettleIdentity(settled);
    expect(settled.grossReturn).toBe(gross);
    expect(settled.outcome).toBe("WIN");
  });

  it("miss pays 0", () => {
    const pos = {
      id: "s1",
      bet_type: "straight" as const,
      label: "17",
      pockets: [17],
      stake: 5,
    };
    expect(rouletteGross(pos, 18)).toBe(0);
    const settled = settleMultiplierRound(5, 0);
    expect(settled.userNet).toBe(-5);
  });
});

describe("arcade settle-path — treasure grid", () => {
  it("cashout after safe reveals uses floor gross", () => {
    const stake = 100;
    const mult = actualMultiplier(25, 5, 3);
    const settled = settleTreasureRound(stake, mult);
    assertSettleIdentity(settled);
    expect(settled.grossReturn).toBe(Math.floor(stake * mult));
    expect(settled.outcome).toBe("WIN");
  });

  it("trap is LOSS at 0×", () => {
    const settled = settleTreasureRound(100, 0);
    expect(settled.outcome).toBe("LOSS");
    expect(settled.userNet).toBe(-100);
  });
});
