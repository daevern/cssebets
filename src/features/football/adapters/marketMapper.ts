// Maps API-Football odds payload into our normalized market model.
// Phase 1 supports the 5 most reliable, universally settled markets.

import type { AfOddsResponse } from "./apiFootballAdapter.server";

export type NormalizedMarket = {
  marketKey: string;
  displayName: string;
  category: string;
  period: string;
  line: number | null;
  sortOrder: number;
  selections: Array<{
    selectionKey: string;
    displayName: string;
    line: number | null;
    decimalOdds: number;
    sortOrder: number;
  }>;
};

// API-Football bet id → our internal spec
const SPECS: Array<{
  betId: number;
  betName?: string; // fallback if id shifts
  marketKey: string;
  displayName: string;
  category: string;
  period: string;
  line?: number;
  sortOrder: number;
  map: (value: string) => { key: string; display: string; sort: number } | null;
}> = [
  {
    betId: 1,
    betName: "Match Winner",
    marketKey: "match_result",
    displayName: "Match Result",
    category: "Match",
    period: "full",
    sortOrder: 10,
    map: (v) => {
      if (v === "Home" || v === "1") return { key: "home", display: "Home", sort: 1 };
      if (v === "Draw" || v === "X") return { key: "draw", display: "Draw", sort: 2 };
      if (v === "Away" || v === "2") return { key: "away", display: "Away", sort: 3 };
      return null;
    },
  },
  {
    betId: 12,
    betName: "Double Chance",
    marketKey: "double_chance",
    displayName: "Double Chance",
    category: "Match",
    period: "full",
    sortOrder: 20,
    map: (v) => {
      const n = v.replace(/\s/g, "");
      if (n === "Home/Draw" || n === "1X") return { key: "1x", display: "Home or Draw", sort: 1 };
      if (n === "Home/Away" || n === "12") return { key: "12", display: "Home or Away", sort: 2 };
      if (n === "Draw/Away" || n === "X2") return { key: "x2", display: "Draw or Away", sort: 3 };
      return null;
    },
  },
  {
    betId: 5,
    betName: "Goals Over/Under",
    marketKey: "total_goals_2_5",
    displayName: "Total Goals",
    category: "Goals",
    period: "full",
    line: 2.5,
    sortOrder: 30,
    map: (v) => {
      if (v === "Over 2.5") return { key: "over_2_5", display: "Over 2.5", sort: 1 };
      if (v === "Under 2.5") return { key: "under_2_5", display: "Under 2.5", sort: 2 };
      return null;
    },
  },
  {
    betId: 8,
    betName: "Both Teams Score",
    marketKey: "btts",
    displayName: "Both Teams to Score",
    category: "Goals",
    period: "full",
    sortOrder: 40,
    map: (v) => {
      if (v === "Yes") return { key: "yes", display: "Yes", sort: 1 };
      if (v === "No") return { key: "no", display: "No", sort: 2 };
      return null;
    },
  },
  {
    betId: 13,
    betName: "First Half Winner",
    marketKey: "1h_result",
    displayName: "First-Half Result",
    category: "Halves",
    period: "1h",
    sortOrder: 50,
    map: (v) => {
      if (v === "Home" || v === "1") return { key: "home", display: "Home", sort: 1 };
      if (v === "Draw" || v === "X") return { key: "draw", display: "Draw", sort: 2 };
      if (v === "Away" || v === "2") return { key: "away", display: "Away", sort: 3 };
      return null;
    },
  },
];

// For each spec, take median odds across bookmakers to reduce single-book bias.
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function normalizeOdds(payload: AfOddsResponse): NormalizedMarket[] {
  const out: NormalizedMarket[] = [];

  for (const spec of SPECS) {
    // For each selection, collect prices across bookmakers.
    const perSelection = new Map<
      string,
      { display: string; sort: number; prices: number[] }
    >();

    for (const bm of payload.bookmakers ?? []) {
      for (const bet of bm.bets ?? []) {
        if (bet.id !== spec.betId && bet.name !== spec.betName) continue;
        for (const v of bet.values ?? []) {
          const mapped = spec.map(v.value);
          if (!mapped) continue;
          const price = Number(v.odd);
          if (!isFinite(price) || price < 1.01) continue;
          const cur = perSelection.get(mapped.key) ?? {
            display: mapped.display,
            sort: mapped.sort,
            prices: [],
          };
          cur.prices.push(price);
          perSelection.set(mapped.key, cur);
        }
      }
    }

    if (perSelection.size === 0) continue;

    out.push({
      marketKey: spec.marketKey,
      displayName: spec.displayName,
      category: spec.category,
      period: spec.period,
      line: spec.line ?? null,
      sortOrder: spec.sortOrder,
      selections: Array.from(perSelection.entries()).map(([key, v]) => ({
        selectionKey: key,
        displayName: v.display,
        line: spec.line ?? null,
        decimalOdds: +median(v.prices).toFixed(2),
        sortOrder: v.sort,
      })),
    });
  }

  return out;
}
