import { describe, expect, it } from "vitest";
import { parseBookmakerPayload } from "./apifootball-mapping";

const bookmaker = (bets: any[]) => [{ id: 1, name: "Test book", bets }];

describe("parseBookmakerPayload", () => {
  it("maps provider labels into internal markets deterministically", () => {
    const payload = bookmaker([
      { name: "Match Winner", values: [
        { value: "Home", odd: "2.10" },
        { value: "Draw", odd: "3.40" },
        { value: "Away", odd: "3.20" },
      ] },
      { name: "Goals Over/Under", values: [
        { value: "Over 2.5", odd: "1.91" },
        { value: "Under 2.5", odd: "1.89" },
      ] },
      { name: "Both Teams Score", values: [
        { value: "Yes", odd: "1.8" },
        { value: "No", odd: "2.0" },
      ] },
      { name: "Exact Score", values: [{ value: "1 : 0", odd: "7.5" }] },
      { name: "HT/FT Double", values: [{ value: "Home/Draw", odd: "15" }] },
      { name: "Exact Goals Number", values: [{ value: "5 or more", odd: "11" }] },
    ]);

    const first = parseBookmakerPayload(payload);
    const second = parseBookmakerPayload(payload);

    expect(first).toEqual(second);
    expect(first.ref).toEqual({ home: 2.1, draw: 3.4, away: 3.2 });
    expect(first.odds).toEqual(expect.arrayContaining([
      { market: "over_under_2_5", selection: "OVER_2_5", odds: 1.91 },
      { market: "over_under_2_5", selection: "UNDER_2_5", odds: 1.89 },
      { market: "btts", selection: "YES", odds: 1.8 },
      { market: "btts", selection: "NO", odds: 2 },
      { market: "correct_score", selection: "1-0", odds: 7.5 },
      { market: "half_time_full_time", selection: "HOME_DRAW", odds: 15 },
      { market: "exact_total_goals", selection: "GOALS_5_PLUS", odds: 11 },
    ]));
  });

  it("ignores malformed, nullish, negative, zero, NaN and infinite provider odds", () => {
    const result = parseBookmakerPayload(bookmaker([
      { name: "Goals Over/Under", values: [
        { value: "Over 2.5", odd: null },
        { value: "Over 2.5", odd: undefined },
        { value: "Over 2.5", odd: "" },
        { value: "Over 2.5", odd: "not-a-number" },
        { value: "Over 2.5", odd: "NaN" },
        { value: "Over 2.5", odd: "Infinity" },
        { value: "Over 2.5", odd: 0 },
        { value: "Over 2.5", odd: -2 },
        { value: "Over 2.5", odd: 1.009 },
        { value: "Over 2.5", odd: 1.5 },
      ] },
      { name: "Exact Score", values: [
        { value: "10-10", odd: 40 },
        { value: "broken", odd: 9 },
      ] },
    ]));

    expect(result.odds).toEqual([{ market: "over_under_2_5", selection: "OVER_2_5", odds: 1.5 }]);
    expect(result.ref).toBeNull();
  });

  it("uses median odds across duplicate bookmaker selections", () => {
    const result = parseBookmakerPayload([
      { bets: [{ name: "Both Teams Score", values: [{ value: "Yes", odd: 1.7 }] }] },
      { bets: [{ name: "Both Teams Score", values: [{ value: "Yes", odd: 1.9 }] }] },
      { bets: [{ name: "Both Teams Score", values: [{ value: "Yes", odd: 2.1 }] }] },
    ]);

    expect(result.odds).toContainEqual({ market: "btts", selection: "YES", odds: 1.9 });
  });
});
