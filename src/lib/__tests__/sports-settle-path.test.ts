/**
 * Sports settle-path: decimal-odds wallet identities + regulation score guard.
 */
import { describe, expect, it } from "vitest";
import {
  assertSettleIdentity,
  settleSportsBet,
} from "@/lib/arcade/settle-path";
import { potentialPayout, roundMoney } from "@/lib/accounting/money";
import { regulationSettleBlockReason } from "@/lib/settlement-guards";
import { decideWinningKeys } from "@/features/football/services/decideWinningKeys";

describe("sports settle-path — decimal odds", () => {
  it("WIN credits stake × odds as gross and profit as userNet", () => {
    const stake = 40;
    const odds = 2.35;
    const settled = settleSportsBet(stake, odds, "win");
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("WIN");
    expect(settled.grossReturn).toBe(potentialPayout(stake, odds));
    expect(settled.userNet).toBe(roundMoney(settled.grossReturn - stake));
    expect(settled.userNet).toBeGreaterThan(0);
  });

  it("LOSS zeroes gross and nets −stake", () => {
    const settled = settleSportsBet(40, 2.35, "lose");
    assertSettleIdentity(settled);
    expect(settled.outcome).toBe("LOSS");
    expect(settled.grossReturn).toBe(0);
    expect(settled.userNet).toBe(-40);
  });

  it("VOID and PUSH return the stake with net 0", () => {
    for (const result of ["void", "push"] as const) {
      const settled = settleSportsBet(40, 2.35, result);
      assertSettleIdentity(settled);
      expect(settled.grossReturn).toBe(40);
      expect(settled.userNet).toBe(0);
    }
  });

  it("half-up rounding matches potentialPayout on awkward odds", () => {
    // 10 × 1.85 = 18.5 exactly; 7 × 2.17 = 15.19
    expect(settleSportsBet(10, 1.85, "win").grossReturn).toBe(18.5);
    expect(settleSportsBet(7, 2.17, "win").grossReturn).toBe(15.19);
  });
});

describe("sports settle-path — winning keys → bet result", () => {
  const ctx = { homeScore: 2, awayScore: 1, htHomeScore: 1, htAwayScore: null as number | null };

  it("match_result home pick wins when keys include home", () => {
    const d = decideWinningKeys({ marketKey: "match_result", line: null, period: "full" }, ctx);
    expect(d.status).toBe("settled");
    if (d.status !== "settled") return;
    expect(d.winningKeys).toContain("home");
    const win = settleSportsBet(25, 1.9, "win");
    const lose = settleSportsBet(25, 1.9, "lose");
    expect(win.userNet).toBeGreaterThan(0);
    expect(lose.userNet).toBe(-25);
  });

  it("draw_no_bet on draw voids (stake returned)", () => {
    const d = decideWinningKeys(
      { marketKey: "draw_no_bet", line: null, period: "full" },
      { homeScore: 1, awayScore: 1, htHomeScore: null, htAwayScore: null },
    );
    expect(d.status).toBe("void");
    const settled = settleSportsBet(30, 1.8, "void");
    expect(settled.userNet).toBe(0);
    expect(settled.grossReturn).toBe(30);
  });
});

describe("sports settle-path — regulation score guard", () => {
  const etMatch = {
    home_score: 1,
    away_score: 1,
    ft_home_score: 2,
    ft_away_score: 1,
  };

  it("blocks FT aggregate when regulation differs (ET)", () => {
    const reason = regulationSettleBlockReason(etMatch, 2, 1);
    expect(reason).toMatch(/non-regulation|regulation/i);
  });

  it("allows regulation scores after ET", () => {
    expect(regulationSettleBlockReason(etMatch, 1, 1)).toBeNull();
  });

  it("allows normal full-time when no ET", () => {
    const m = {
      home_score: 3,
      away_score: 0,
      ft_home_score: 3,
      ft_away_score: 0,
    };
    expect(regulationSettleBlockReason(m, 3, 0)).toBeNull();
  });
});
