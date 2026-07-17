import { describe, it, expect } from "vitest";
import {
  buildRaceWinnerOdds,
  buildPodiumOdds,
  buildPointsOdds,
  buildHeadToHeadOdds,
  buildChampionshipOdds,
} from "../services/f1OddsBuilder.server";

describe("f1 odds builder", () => {
  const inputs = [
    { driverKey: "verstappen", points: 500 },
    { driverKey: "norris", points: 350 },
    { driverKey: "leclerc", points: 300 },
    { driverKey: "russell", points: 200 },
    { driverKey: "hamilton", points: 150 },
    { driverKey: "bottas", points: 20 },
  ];

  it("race winner odds sum below 1/overround (positive margin)", () => {
    const odds = buildRaceWinnerOdds(inputs);
    expect(odds.length).toBe(inputs.length);
    const impliedSum = odds.reduce((s, o) => s + 1 / o.offeredOdds, 0);
    expect(impliedSum).toBeGreaterThan(1); // overround present
  });

  it("respects floor and cap", () => {
    const odds = buildRaceWinnerOdds(inputs);
    for (const o of odds) {
      expect(o.offeredOdds).toBeGreaterThanOrEqual(1.05);
      expect(o.offeredOdds).toBeLessThanOrEqual(50);
    }
  });

  it("podium and points odds shorter than winner odds", () => {
    const w = buildRaceWinnerOdds(inputs);
    const p = buildPodiumOdds(w);
    const pt = buildPointsOdds(w);
    for (let i = 0; i < w.length; i++) {
      // higher probability → shorter odds (except for capped edges)
      if (w[i].offeredOdds < 40) expect(p[i].offeredOdds).toBeLessThanOrEqual(w[i].offeredOdds);
      if (p[i].offeredOdds < 40) expect(pt[i].offeredOdds).toBeLessThanOrEqual(p[i].offeredOdds);
    }
  });

  it("head-to-head favours higher-prob driver", () => {
    const h = buildHeadToHeadOdds(
      { key: "a", probability: 0.6 },
      { key: "b", probability: 0.2 },
    );
    expect(h.aOdds).toBeLessThan(h.bOdds);
  });

  it("championship marks eliminated when gap > remaining points", () => {
    const standings = [
      { key: "leader", points: 400 },
      { key: "tail", points: 5 },
    ];
    const odds = buildChampionshipOdds(standings, 1); // 25 pts left → tail eliminated
    const tail = odds.find((o) => o.driverKey === "tail")!;
    expect(tail.offeredOdds).toBe(50);
  });
});
