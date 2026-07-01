import { describe, expect, it } from "vitest";
import { apply3WayMargin, applyOutrightMargin, compute3WayOdds, parseValidDecimalOdd, validateThreeWayOdds } from "./odds-margin.server";

describe("odds margin validation", () => {
  it.each([null, undefined, "", "2.5", Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.009, 1000.01])(
    "rejects invalid odd %p",
    (value) => {
      expect(() => parseValidDecimalOdd(value)).toThrow();
    },
  );

  it("accepts finite decimal odds inside the supported range", () => {
    expect(parseValidDecimalOdd(1.01)).toBe(1.01);
    expect(parseValidDecimalOdd(2.5)).toBe(2.5);
    expect(validateThreeWayOdds({ home: 2, draw: 3.5, away: 4 })).toEqual({ home: 2, draw: 3.5, away: 4 });
  });

  it("computes deterministic rounded three-way house odds", async () => {
    const first = await compute3WayOdds({ home: 2.1, draw: 3.4, away: 3.2 });
    const second = await compute3WayOdds({ home: 2.1, draw: 3.4, away: 3.2 });

    expect(first).toEqual(second);
    expect(first.final.home).toBeCloseTo(1.75, 2);
    expect(first.final.draw).toBeCloseTo(2.83, 2);
    expect(first.final.away).toBeCloseTo(2.66, 2);
    expect(first.marginPct).toBe(25);
  });

  it("can bypass margin when a match has margin disabled", async () => {
    const fair = await apply3WayMargin({ home: 2.1, draw: 3.4, away: 3.2 }, { applyMargin: false });
    const housed = await apply3WayMargin({ home: 2.1, draw: 3.4, away: 3.2 });

    expect(fair.home).toBeGreaterThan(housed.home);
    expect(fair.draw).toBeGreaterThan(housed.draw);
    expect(fair.away).toBeGreaterThan(housed.away);
  });

  it("rejects invalid outright odds instead of silently coercing them", async () => {
    await expect(applyOutrightMargin([{ team: "A", odds: Number.NaN }])).rejects.toThrow();
  });
});
