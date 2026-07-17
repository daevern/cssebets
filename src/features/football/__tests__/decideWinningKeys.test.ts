import { describe, expect, it } from "vitest";
import { decideWinningKeys, type MarketContext, type SettleDecision } from "../services/decideWinningKeys";

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

// narrowing helper — tests are meaningless if we accidentally read winningKeys off a void.
function keys(d: SettleDecision): string[] {
  if (d.status !== "settled") throw new Error(`expected settled, got void: ${d.reason}`);
  return d.winningKeys;
}

const mk = (marketKey: string, line: number | null = null, period = "full") =>
  ({ marketKey, line, period });

describe("decideWinningKeys — match/period result", () => {
  it("home win → 1x2", () => {
    expect(keys(decideWinningKeys(mk("match_result"), ctx(2, 1)))).toEqual(["home"]);
  });
  it("draw → 1x2 draw", () => {
    expect(keys(decideWinningKeys(mk("match_result"), ctx(1, 1)))).toEqual(["draw"]);
  });
  it("away win → 1x2", () => {
    expect(keys(decideWinningKeys(mk("match_result"), ctx(0, 2)))).toEqual(["away"]);
  });

  it("double chance home win → 1x AND 12", () => {
    expect(keys(decideWinningKeys(mk("double_chance"), ctx(3, 0)))).toEqual(["1x", "12"]);
  });
  it("double chance draw → 1x AND x2", () => {
    expect(keys(decideWinningKeys(mk("double_chance"), ctx(1, 1)))).toEqual(["1x", "x2"]);
  });

  it("DNB on draw → void", () => {
    expect(decideWinningKeys(mk("draw_no_bet"), ctx(1, 1)).status).toBe("void");
  });
  it("DNB on away win → away", () => {
    expect(keys(decideWinningKeys(mk("draw_no_bet"), ctx(0, 3)))).toEqual(["away"]);
  });
});

describe("decideWinningKeys — goals O/U", () => {
  it("total 3 > line 2.5 → over", () => {
    expect(keys(decideWinningKeys(mk("total_goals_2_5", 2.5), ctx(2, 1)))).toEqual(["over_2_5"]);
  });
  it("total 2 < line 2.5 → under", () => {
    expect(keys(decideWinningKeys(mk("total_goals_2_5", 2.5), ctx(1, 1)))).toEqual(["under_2_5"]);
  });
  it("0-0 goals 0.5 → under", () => {
    expect(keys(decideWinningKeys(mk("total_goals_0_5", 0.5), ctx(0, 0)))).toEqual(["under_0_5"]);
  });
  it("5 goals over 4.5 → over", () => {
    expect(keys(decideWinningKeys(mk("total_goals_4_5", 4.5), ctx(3, 2)))).toEqual(["over_4_5"]);
  });
  it("O/U missing line → void", () => {
    expect(decideWinningKeys(mk("total_goals_2_5", null), ctx(1, 1)).status).toBe("void");
  });
});

describe("decideWinningKeys — BTTS / odd-even / exact / margin", () => {
  it("btts 2-1 → yes", () => {
    expect(keys(decideWinningKeys(mk("btts"), ctx(2, 1)))).toEqual(["yes"]);
  });
  it("btts 3-0 → no", () => {
    expect(keys(decideWinningKeys(mk("btts"), ctx(3, 0)))).toEqual(["no"]);
  });
  it("odd/even: 3 total → odd", () => {
    expect(keys(decideWinningKeys(mk("goals_odd_even"), ctx(2, 1)))).toEqual(["odd"]);
  });
  it("exact goals 2 → exact_2", () => {
    expect(keys(decideWinningKeys(mk("exact_goals"), ctx(1, 1)))).toEqual(["exact_2"]);
  });
  it("exact goals 7 → 6+ bucket", () => {
    expect(keys(decideWinningKeys(mk("exact_goals"), ctx(4, 3)))).toEqual(["exact_6_plus"]);
  });
  it("winning margin home by 2", () => {
    expect(keys(decideWinningKeys(mk("winning_margin"), ctx(3, 1)))).toEqual(["home_by_2"]);
  });
  it("winning margin away by 4+", () => {
    expect(keys(decideWinningKeys(mk("winning_margin"), ctx(0, 5)))).toEqual(["away_by_4_plus"]);
  });
  it("winning margin draw", () => {
    expect(keys(decideWinningKeys(mk("winning_margin"), ctx(2, 2)))).toEqual(["draw"]);
  });
});

describe("decideWinningKeys — half markets", () => {
  it("1h result requires HT → void when missing", () => {
    expect(decideWinningKeys(mk("1h_result", null, "1h"), ctx(2, 1)).status).toBe("void");
  });
  it("1h result home leads at HT", () => {
    expect(keys(decideWinningKeys(mk("1h_result", null, "1h"), ctx(2, 1, [1, 0])))).toEqual(["home"]);
  });
  it("2h result computed from FT-HT", () => {
    expect(keys(decideWinningKeys(mk("2h_result", null, "2h"), ctx(1, 2, [1, 0])))).toEqual(["away"]);
  });
  it("1h goals over 1.5 (HT 1-1)", () => {
    expect(keys(decideWinningKeys(mk("1h_goals_1_5", 1.5, "1h"), ctx(2, 2, [1, 1])))).toEqual(["over_1_5"]);
  });
  it("2h goals under 0.5 (HT 2-1, FT 2-1)", () => {
    expect(keys(decideWinningKeys(mk("2h_goals_0_5", 0.5, "2h"), ctx(2, 1, [2, 1])))).toEqual(["under_0_5"]);
  });
  it("highest scoring half: first (HT 3-0, FT 3-1)", () => {
    expect(keys(decideWinningKeys(mk("highest_scoring_half"), ctx(3, 1, [3, 0])))).toEqual(["first"]);
  });
  it("highest scoring half: equal (HT 1-0, FT 2-1)", () => {
    expect(keys(decideWinningKeys(mk("highest_scoring_half"), ctx(2, 1, [1, 0])))).toEqual(["equal"]);
  });
});

describe("decideWinningKeys — team totals / clean sheets", () => {
  it("home goals over 1.5 (home scored 2)", () => {
    expect(keys(decideWinningKeys(mk("home_goals_1_5", 1.5), ctx(2, 0)))).toEqual(["over_1_5"]);
  });
  it("away goals under 0.5 (away scored 0)", () => {
    expect(keys(decideWinningKeys(mk("away_goals_0_5", 0.5), ctx(3, 0)))).toEqual(["under_0_5"]);
  });
  it("home clean sheet yes (away 0)", () => {
    expect(keys(decideWinningKeys(mk("home_clean_sheet"), ctx(1, 0)))).toEqual(["yes"]);
  });
  it("home clean sheet no (away scored)", () => {
    expect(keys(decideWinningKeys(mk("home_clean_sheet"), ctx(2, 1)))).toEqual(["no"]);
  });
  it("away clean sheet yes (home 0)", () => {
    expect(keys(decideWinningKeys(mk("away_clean_sheet"), ctx(0, 2)))).toEqual(["yes"]);
  });
});

describe("decideWinningKeys — unsupported / edge", () => {
  it("unknown key → void with reason", () => {
    const d = decideWinningKeys(mk("correct_score"), ctx(2, 1));
    expect(d.status).toBe("void");
    if (d.status === "void") expect(d.reason).toMatch(/unsupported/);
  });
});
