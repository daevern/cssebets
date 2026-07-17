import { describe, expect, it } from "vitest";
import { decideWinningKeys, type MarketContext } from "../services/decideWinningKeys";

const ctx = (
  h: number,
  a: number,
  ht: [number, number] | null = null,
): MarketContext => ({
  homeScore: h,
  awayScore: a,
  htHomeScore: ht?.[0] ?? null,
  htAwayScore: ht?.[1] ?? null,
});

describe("decideWinningKeys — match/period result", () => {
  it("home win → 1x2", () => {
    expect(decideWinningKeys({ marketKey: "match_result", period: "full", line: null }, ctx(2, 1))).toMatchObject({
      status: "settled", winningKeys: ["home"],
    });
  });
  it("draw → 1x2 draw", () => {
    expect(decideWinningKeys({ marketKey: "match_result", period: "full", line: null }, ctx(1, 1)).winningKeys).toEqual(["draw"]);
  });
  it("away win → 1x2", () => {
    expect(decideWinningKeys({ marketKey: "match_result", period: "full", line: null }, ctx(0, 2)).winningKeys).toEqual(["away"]);
  });

  it("double chance home win → 1x AND 12", () => {
    expect(decideWinningKeys({ marketKey: "double_chance", period: "full", line: null }, ctx(3, 0)).winningKeys).toEqual(["1x", "12"]);
  });
  it("double chance draw → 1x AND x2", () => {
    expect(decideWinningKeys({ marketKey: "double_chance", period: "full", line: null }, ctx(1, 1)).winningKeys).toEqual(["1x", "x2"]);
  });

  it("DNB on draw → void", () => {
    expect(decideWinningKeys({ marketKey: "draw_no_bet", period: "full", line: null }, ctx(1, 1)).status).toBe("void");
  });
  it("DNB on away win → away", () => {
    expect(decideWinningKeys({ marketKey: "draw_no_bet", period: "full", line: null }, ctx(0, 3)).winningKeys).toEqual(["away"]);
  });
});

describe("decideWinningKeys — goals O/U", () => {
  it("total 3 > line 2.5 → over", () => {
    expect(decideWinningKeys({ marketKey: "total_goals_2_5", period: "full", line: 2.5 }, ctx(2, 1)).winningKeys).toEqual(["over_2_5"]);
  });
  it("total 2 < line 2.5 → under", () => {
    expect(decideWinningKeys({ marketKey: "total_goals_2_5", period: "full", line: 2.5 }, ctx(1, 1)).winningKeys).toEqual(["under_2_5"]);
  });
  it("0-0 goals 0.5 → under", () => {
    expect(decideWinningKeys({ marketKey: "total_goals_0_5", period: "full", line: 0.5 }, ctx(0, 0)).winningKeys).toEqual(["under_0_5"]);
  });
  it("5 goals over 4.5 → over", () => {
    expect(decideWinningKeys({ marketKey: "total_goals_4_5", period: "full", line: 4.5 }, ctx(3, 2)).winningKeys).toEqual(["over_4_5"]);
  });
});

describe("decideWinningKeys — BTTS / odd-even / exact / margin", () => {
  it("btts 2-1 → yes", () => {
    expect(decideWinningKeys({ marketKey: "btts", period: "full", line: null }, ctx(2, 1)).winningKeys).toEqual(["yes"]);
  });
  it("btts 3-0 → no", () => {
    expect(decideWinningKeys({ marketKey: "btts", period: "full", line: null }, ctx(3, 0)).winningKeys).toEqual(["no"]);
  });
  it("odd/even: 3 total → odd", () => {
    expect(decideWinningKeys({ marketKey: "goals_odd_even", period: "full", line: null }, ctx(2, 1)).winningKeys).toEqual(["odd"]);
  });
  it("exact goals 2 → exact_2", () => {
    expect(decideWinningKeys({ marketKey: "exact_goals", period: "full", line: null }, ctx(1, 1)).winningKeys).toEqual(["exact_2"]);
  });
  it("exact goals 7 → 6+ bucket", () => {
    expect(decideWinningKeys({ marketKey: "exact_goals", period: "full", line: null }, ctx(4, 3)).winningKeys).toEqual(["exact_6_plus"]);
  });
  it("winning margin home by 2", () => {
    expect(decideWinningKeys({ marketKey: "winning_margin", period: "full", line: null }, ctx(3, 1)).winningKeys).toEqual(["home_by_2"]);
  });
  it("winning margin away by 4+", () => {
    expect(decideWinningKeys({ marketKey: "winning_margin", period: "full", line: null }, ctx(0, 5)).winningKeys).toEqual(["away_by_4_plus"]);
  });
  it("winning margin draw", () => {
    expect(decideWinningKeys({ marketKey: "winning_margin", period: "full", line: null }, ctx(2, 2)).winningKeys).toEqual(["draw"]);
  });
});

describe("decideWinningKeys — half markets", () => {
  it("1h result requires HT → void when missing", () => {
    expect(decideWinningKeys({ marketKey: "1h_result", period: "1h", line: null }, ctx(2, 1)).status).toBe("void");
  });
  it("1h result home leads at HT", () => {
    expect(decideWinningKeys({ marketKey: "1h_result", period: "1h", line: null }, ctx(2, 1, [1, 0])).winningKeys).toEqual(["home"]);
  });
  it("2h result computed from FT-HT", () => {
    // HT 1-0, FT 1-2 → 2H = 0-2 → away
    expect(decideWinningKeys({ marketKey: "2h_result", period: "2h", line: null }, ctx(1, 2, [1, 0])).winningKeys).toEqual(["away"]);
  });
  it("1h goals over 1.5 (HT 1-1)", () => {
    expect(decideWinningKeys({ marketKey: "1h_goals_1_5", period: "1h", line: 1.5 }, ctx(2, 2, [1, 1])).winningKeys).toEqual(["over_1_5"]);
  });
  it("2h goals under 0.5 (HT 2-1, FT 2-1)", () => {
    expect(decideWinningKeys({ marketKey: "2h_goals_0_5", period: "2h", line: 0.5 }, ctx(2, 1, [2, 1])).winningKeys).toEqual(["under_0_5"]);
  });
  it("highest scoring half: first (HT 3-0, FT 3-1)", () => {
    expect(decideWinningKeys({ marketKey: "highest_scoring_half", period: "full", line: null }, ctx(3, 1, [3, 0])).winningKeys).toEqual(["first"]);
  });
  it("highest scoring half: equal (HT 1-0, FT 2-1)", () => {
    expect(decideWinningKeys({ marketKey: "highest_scoring_half", period: "full", line: null }, ctx(2, 1, [1, 0])).winningKeys).toEqual(["equal"]);
  });
});

describe("decideWinningKeys — team totals / clean sheets", () => {
  it("home goals over 1.5 (home scored 2)", () => {
    expect(decideWinningKeys({ marketKey: "home_goals_1_5", period: "full", line: 1.5 }, ctx(2, 0)).winningKeys).toEqual(["over_1_5"]);
  });
  it("away goals under 0.5 (away scored 0)", () => {
    expect(decideWinningKeys({ marketKey: "away_goals_0_5", period: "full", line: 0.5 }, ctx(3, 0)).winningKeys).toEqual(["under_0_5"]);
  });
  it("home clean sheet yes (away 0)", () => {
    expect(decideWinningKeys({ marketKey: "home_clean_sheet", period: "full", line: null }, ctx(1, 0)).winningKeys).toEqual(["yes"]);
  });
  it("home clean sheet no (away scored)", () => {
    expect(decideWinningKeys({ marketKey: "home_clean_sheet", period: "full", line: null }, ctx(2, 1)).winningKeys).toEqual(["no"]);
  });
  it("away clean sheet yes (home 0)", () => {
    expect(decideWinningKeys({ marketKey: "away_clean_sheet", period: "full", line: null }, ctx(0, 2)).winningKeys).toEqual(["yes"]);
  });
});

describe("decideWinningKeys — unsupported / edge", () => {
  it("unknown key → void with reason", () => {
    const d = decideWinningKeys({ marketKey: "correct_score", period: "full", line: null }, ctx(2, 1));
    expect(d.status).toBe("void");
    if (d.status === "void") expect(d.reason).toMatch(/unsupported/);
  });
  it("O/U missing line → void", () => {
    expect(decideWinningKeys({ marketKey: "total_goals_2_5", period: "full", line: null }, ctx(1, 1)).status).toBe("void");
  });
});
