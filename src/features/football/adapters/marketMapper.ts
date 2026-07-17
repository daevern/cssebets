// Maps API-Football odds payload into our normalized market model.
// Phase 1.5 (production hardening) — expanded coverage. Every market listed
// here MUST have a corresponding settlement rule in
// footballSettlement.server.ts#decideWinningKeys(). If you add a spec here
// without a settlement rule, the market will be created but auto-voided
// when the match finishes.

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

type Mapped = { key: string; display: string; sort: number };

type Spec = {
  // Match by bet id when known; fall back to bet name (case-insensitive contains).
  betIds?: number[];
  betNamePatterns?: RegExp[];
  marketKey: string;
  displayName: string;
  category: string;
  period: string;
  line?: number;
  sortOrder: number;
  map: (value: string) => Mapped | null;
};

// ---- reusable value mappers ----

function map1x2(v: string): Mapped | null {
  const s = v.trim();
  if (s === "Home" || s === "1") return { key: "home", display: "Home", sort: 1 };
  if (s === "Draw" || s === "X") return { key: "draw", display: "Draw", sort: 2 };
  if (s === "Away" || s === "2") return { key: "away", display: "Away", sort: 3 };
  return null;
}

function mapDoubleChance(v: string): Mapped | null {
  const n = v.replace(/\s/g, "");
  if (n === "Home/Draw" || n === "1X" || n === "1/X")
    return { key: "1x", display: "Home or Draw", sort: 1 };
  if (n === "Home/Away" || n === "12" || n === "1/2")
    return { key: "12", display: "Home or Away", sort: 2 };
  if (n === "Draw/Away" || n === "X2" || n === "X/2")
    return { key: "x2", display: "Draw or Away", sort: 3 };
  return null;
}

function mapDrawNoBet(v: string): Mapped | null {
  const s = v.trim();
  if (s === "Home" || s === "1") return { key: "home", display: "Home", sort: 1 };
  if (s === "Away" || s === "2") return { key: "away", display: "Away", sort: 2 };
  return null;
}

function mapYesNo(v: string): Mapped | null {
  const s = v.trim().toLowerCase();
  if (s === "yes") return { key: "yes", display: "Yes", sort: 1 };
  if (s === "no") return { key: "no", display: "No", sort: 2 };
  return null;
}

function mapOddEven(v: string): Mapped | null {
  const s = v.trim().toLowerCase();
  if (s === "odd" || s === "odds") return { key: "odd", display: "Odd", sort: 1 };
  if (s === "even" || s === "evens") return { key: "even", display: "Even", sort: 2 };
  return null;
}

// Parses "Over 2.5" / "Under 2.5" (with tolerance for whitespace).
function makeOuMapper(line: number): (v: string) => Mapped | null {
  return (v: string) => {
    const m = /^\s*(Over|Under)\s+([\d.]+)\s*$/i.exec(v);
    if (!m) return null;
    const n = Number(m[2]);
    if (Math.abs(n - line) > 0.001) return null;
    const side = m[1].toLowerCase();
    const keyBase = line.toString().replace(".", "_");
    if (side === "over") return { key: `over_${keyBase}`, display: `Over ${line}`, sort: 1 };
    return { key: `under_${keyBase}`, display: `Under ${line}`, sort: 2 };
  };
}

function mapExactGoals(v: string): Mapped | null {
  // API-Football values look like "0", "1", ..., "5", "6+" or "7+"
  const s = v.trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n < 0 || n > 6) return null;
    return { key: `exact_${n}`, display: `${n} Goals`, sort: n + 1 };
  }
  const plus = /^(\d+)\+$/.exec(s);
  if (plus) {
    // Normalize any "N+" tail into a single "6+" bucket so settlement is deterministic.
    return { key: "exact_6_plus", display: "6+ Goals", sort: 100 };
  }
  return null;
}

function mapWinningMargin(v: string): Mapped | null {
  const s = v.trim().toLowerCase();
  // API-Football commonly returns strings like:
  //   "home by 1", "away by 2", "draw", "no goal", "any other home win", "any other away win"
  if (s === "draw" || s === "no goal") return { key: "draw", display: "Draw", sort: 50 };
  const m = /(home|away)\s+by\s+(\d+)/.exec(s);
  if (m) {
    const side = m[1];
    const n = Number(m[2]);
    if (n < 1 || n > 3) return null;
    return {
      key: `${side}_by_${n}`,
      display: `${side === "home" ? "Home" : "Away"} by ${n}`,
      sort: side === "home" ? 10 + n : 90 + n,
    };
  }
  const other = /any other (home|away) win/.exec(s);
  if (other) {
    const side = other[1];
    return {
      key: `${side}_by_4_plus`,
      display: `${side === "home" ? "Home" : "Away"} by 4+`,
      sort: side === "home" ? 20 : 100,
    };
  }
  return null;
}

function mapHighestScoringHalf(v: string): Mapped | null {
  const s = v.trim().toLowerCase().replace(/\s+/g, " ");
  if (s.startsWith("first")) return { key: "first", display: "First Half", sort: 1 };
  if (s.startsWith("second")) return { key: "second", display: "Second Half", sort: 2 };
  if (s === "equal" || s === "tie" || s === "draw" || s === "equals")
    return { key: "equal", display: "Equal", sort: 3 };
  return null;
}

// ---- spec table ----

function ouSpecs(config: {
  marketKeyBase: string;
  displayBase: string;
  category: string;
  period: string;
  betNamePatterns: RegExp[];
  betIds?: number[];
  sortStart: number;
  lines: number[];
}): Spec[] {
  return config.lines.map((line, idx) => ({
    betIds: config.betIds,
    betNamePatterns: config.betNamePatterns,
    marketKey: `${config.marketKeyBase}_${line.toString().replace(".", "_")}`,
    displayName: `${config.displayBase} ${line}`,
    category: config.category,
    period: config.period,
    line,
    sortOrder: config.sortStart + idx,
    map: makeOuMapper(line),
  }));
}

const SPECS: Spec[] = [
  // ---- Match / period result ----
  {
    betIds: [1],
    betNamePatterns: [/^match winner$/i, /^match result$/i, /^1x2$/i, /^full time result$/i],
    marketKey: "match_result",
    displayName: "Match Result",
    category: "Match",
    period: "full",
    sortOrder: 10,
    map: map1x2,
  },
  {
    betIds: [12],
    betNamePatterns: [/^double chance$/i],
    marketKey: "double_chance",
    displayName: "Double Chance",
    category: "Match",
    period: "full",
    sortOrder: 20,
    map: mapDoubleChance,
  },
  {
    betNamePatterns: [/draw\s*no\s*bet/i, /^dnb$/i],
    marketKey: "draw_no_bet",
    displayName: "Draw No Bet",
    category: "Match",
    period: "full",
    sortOrder: 25,
    map: mapDrawNoBet,
  },

  // ---- Full-time goals O/U ----
  ...ouSpecs({
    marketKeyBase: "total_goals",
    displayBase: "Total Goals",
    category: "Goals",
    period: "full",
    betIds: [5],
    betNamePatterns: [/^goals over\/?under$/i, /^total goals$/i, /^over\/under$/i],
    sortStart: 30,
    lines: [0.5, 1.5, 2.5, 3.5, 4.5],
  }),

  // ---- BTTS + goals odd/even + exact goals + winning margin ----
  {
    betIds: [8],
    betNamePatterns: [/^both teams (to )?score$/i, /^btts$/i],
    marketKey: "btts",
    displayName: "Both Teams to Score",
    category: "Goals",
    period: "full",
    sortOrder: 40,
    map: mapYesNo,
  },
  {
    betIds: [21],
    betNamePatterns: [/^odd\/?even$/i, /^goals odd\/?even$/i],
    marketKey: "goals_odd_even",
    displayName: "Total Goals: Odd/Even",
    category: "Goals",
    period: "full",
    sortOrder: 45,
    map: mapOddEven,
  },
  {
    betIds: [38],
    betNamePatterns: [/exact goals? number/i, /^exact goals$/i],
    marketKey: "exact_goals",
    displayName: "Exact Goals",
    category: "Goals",
    period: "full",
    sortOrder: 46,
    map: mapExactGoals,
  },
  {
    betNamePatterns: [/winning margin/i],
    marketKey: "winning_margin",
    displayName: "Winning Margin",
    category: "Match",
    period: "full",
    sortOrder: 47,
    map: mapWinningMargin,
  },

  // ---- Half results ----
  {
    betIds: [13],
    betNamePatterns: [/^first half winner$/i, /^1st half winner$/i, /^ht result$/i],
    marketKey: "1h_result",
    displayName: "First-Half Result",
    category: "Halves",
    period: "1h",
    sortOrder: 50,
    map: map1x2,
  },
  {
    betIds: [25],
    betNamePatterns: [/^second half winner$/i, /^2nd half winner$/i],
    marketKey: "2h_result",
    displayName: "Second-Half Result",
    category: "Halves",
    period: "2h",
    sortOrder: 51,
    map: map1x2,
  },

  // ---- 1H goals O/U ----
  ...ouSpecs({
    marketKeyBase: "1h_goals",
    displayBase: "1H Total Goals",
    category: "Halves",
    period: "1h",
    betIds: [6],
    betNamePatterns: [/goals over\/?under first half/i, /first half.*over\/?under/i],
    sortStart: 60,
    lines: [0.5, 1.5, 2.5],
  }),

  // ---- 2H goals O/U ----
  ...ouSpecs({
    marketKeyBase: "2h_goals",
    displayBase: "2H Total Goals",
    category: "Halves",
    period: "2h",
    betIds: [26],
    betNamePatterns: [/goals over\/?under.*second half/i, /second half.*over\/?under/i],
    sortStart: 65,
    lines: [0.5, 1.5, 2.5],
  }),

  {
    betNamePatterns: [/highest scoring half/i],
    marketKey: "highest_scoring_half",
    displayName: "Highest Scoring Half",
    category: "Halves",
    period: "full",
    sortOrder: 70,
    map: mapHighestScoringHalf,
  },

  // ---- Team totals ----
  ...ouSpecs({
    marketKeyBase: "home_goals",
    displayBase: "Home Team Goals",
    category: "Teams",
    period: "full",
    betIds: [16],
    betNamePatterns: [/^total\s*-\s*home$/i, /^total home$/i, /home team total/i],
    sortStart: 80,
    lines: [0.5, 1.5, 2.5],
  }),
  ...ouSpecs({
    marketKeyBase: "away_goals",
    displayBase: "Away Team Goals",
    category: "Teams",
    period: "full",
    betIds: [17],
    betNamePatterns: [/^total\s*-\s*away$/i, /^total away$/i, /away team total/i],
    sortStart: 90,
    lines: [0.5, 1.5, 2.5],
  }),

  // ---- Clean sheets ----
  {
    betIds: [27],
    betNamePatterns: [/clean sheet\s*-\s*home/i, /home clean sheet/i],
    marketKey: "home_clean_sheet",
    displayName: "Home Clean Sheet",
    category: "Teams",
    period: "full",
    sortOrder: 100,
    map: mapYesNo,
  },
  {
    betIds: [28],
    betNamePatterns: [/clean sheet\s*-\s*away/i, /away clean sheet/i],
    marketKey: "away_clean_sheet",
    displayName: "Away Clean Sheet",
    category: "Teams",
    period: "full",
    sortOrder: 101,
    map: mapYesNo,
  },
];

// Take median odds across bookmakers to reduce single-book bias.
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function specMatchesBet(spec: Spec, betId: number, betName: string): boolean {
  if (spec.betIds?.includes(betId)) return true;
  if (spec.betNamePatterns?.some((rx) => rx.test(betName))) return true;
  return false;
}

export function normalizeOdds(payload: AfOddsResponse): NormalizedMarket[] {
  const out: NormalizedMarket[] = [];

  for (const spec of SPECS) {
    const perSelection = new Map<
      string,
      { display: string; sort: number; prices: number[] }
    >();

    for (const bm of payload.bookmakers ?? []) {
      for (const bet of bm.bets ?? []) {
        if (!specMatchesBet(spec, bet.id, bet.name ?? "")) continue;
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

    // Sanity guard: some markets need a minimum number of selections to be safe.
    // e.g. a 1X2 market with only one price is almost certainly a partial feed.
    const minSelections = spec.marketKey === "exact_goals" ? 3 : 2;
    if (perSelection.size < minSelections) continue;

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
