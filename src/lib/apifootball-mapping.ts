// Maps API-Football bet/selection labels to our internal MarketKey + selection.
// Defensive: matches by `name` (string) so we survive API version changes.
//
// CSSEBets internal market keys (today):
//   over_under_2_5, btts, correct_score, half_time_full_time, exact_total_goals
//
// API-Football canonical bet names used here:
//   "Match Winner"          → 1X2 reference odds (drives matches.reference_odds)
//   "Goals Over/Under"      → over_under_2_5 (only the 2.5 line for Phase 1)
//   "Both Teams Score"      → btts
//   "Exact Score"           → correct_score
//   "HT/FT Double"          → half_time_full_time
//   "Exact Goals Number"    → exact_total_goals

export type ParsedOdds = {
  market:
    | "over_under_0_5" | "over_under_1_5" | "over_under_2_5" | "over_under_3_5"
    | "over_under_4_5" | "over_under_5_5" | "over_under_6_5"
    | "btts" | "correct_score" | "half_time_full_time" | "exact_total_goals" | "to_qualify"
    | "double_chance" | "draw_no_bet" | "goals_odd_even"
    | "clean_sheet_home" | "clean_sheet_away" | "win_to_nil_home" | "win_to_nil_away";
  selection: string;
  odds: number;
};

export type ParsedRef = { home: number; draw: number; away: number };

type Bookmaker = {
  id?: number;
  name?: string;
  bets?: Array<{
    id?: number;
    name?: string;
    values?: Array<{ value: string; odd: string | number }>;
  }>;
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const CS_OURS = new Set([
  "0-0","1-0","0-1","1-1","2-0","0-2","2-1","1-2","2-2",
  "3-0","0-3","3-1","1-3","3-2","2-3","3-3",
  "4-0","0-4","4-1","1-4","4-2","2-4",
]);

const HTFT_MAP: Record<string, string> = {
  "Home/Home": "HOME_HOME",
  "Home/Draw": "HOME_DRAW",
  "Home/Away": "HOME_AWAY",
  "Draw/Home": "DRAW_HOME",
  "Draw/Draw": "DRAW_DRAW",
  "Draw/Away": "DRAW_AWAY",
  "Away/Home": "AWAY_HOME",
  "Away/Draw": "AWAY_DRAW",
  "Away/Away": "AWAY_AWAY",
};

// Normalize various API-Football correct-score formats ("1:0", "1 - 0", "1-0")
function normalizeCs(v: string): string | null {
  const m = v.replace(/\s/g, "").match(/^(\d+)[-:](\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const key = `${a}-${b}`;
  return CS_OURS.has(key) ? key : null;
}

function normalizeExactGoals(v: string): string | null {
  const t = v.toLowerCase().trim();
  if (t === "0" || t === "no goal") return "GOALS_0";
  if (t === "1") return "GOALS_1";
  if (t === "2") return "GOALS_2";
  if (t === "3") return "GOALS_3";
  if (t === "4") return "GOALS_4";
  if (t === "5" || t.startsWith("5 or more") || t.startsWith("5+") || t === "more than 4") return "GOALS_5_PLUS";
  // Some books list 6, 7+, etc. — collapse all of them into the 5+ bucket.
  if (/^([6-9]|\d{2,})/.test(t)) return "GOALS_5_PLUS";
  return null;
}

// Returns aggregated median prices across all bookmakers for the bets we use.
export function parseBookmakerPayload(bookmakers: Bookmaker[]): {
  ref: ParsedRef | null;
  odds: ParsedOdds[];
  bookmakerCount: number;
} {
  // Buckets: market+selection -> price list
  const buckets = new Map<string, number[]>();
  const push = (market: ParsedOdds["market"], selection: string, price: number) => {
    if (!isFinite(price) || price < 1.01) return;
    const k = `${market}|${selection}`;
    const arr = buckets.get(k) ?? [];
    arr.push(price);
    buckets.set(k, arr);
  };

  const refHome: number[] = [];
  const refDraw: number[] = [];
  const refAway: number[] = [];

  for (const bm of bookmakers ?? []) {
    for (const bet of bm.bets ?? []) {
      const name = (bet.name ?? "").trim();
      if (!name) continue;

      // 1X2 reference
      if (name === "Match Winner" || name === "Full Time Result") {
        for (const v of bet.values ?? []) {
          const odd = Number(v.odd);
          if (!isFinite(odd) || odd < 1.01) continue;
          const sel = String(v.value).toLowerCase();
          if (sel === "home" || sel === "1") refHome.push(odd);
          else if (sel === "draw" || sel === "x") refDraw.push(odd);
          else if (sel === "away" || sel === "2") refAway.push(odd);
        }
        continue;
      }

      // Goals Over/Under — all supported lines (0.5 → 6.5)
      if (name === "Goals Over/Under") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim();
          const odd = Number(v.odd);
          const m = val.match(/^(Over|Under)\s+(0\.5|1\.5|2\.5|3\.5|4\.5|5\.5|6\.5)$/i);
          if (!m) continue;
          const side = m[1].toUpperCase() === "OVER" ? "OVER" : "UNDER";
          const lineKey = m[2].replace(".", "_"); // "2_5"
          const market = `over_under_${lineKey}` as ParsedOdds["market"];
          push(market, `${side}_${lineKey}`, odd);
        }
        continue;
      }

      // Double Chance: values "Home/Draw", "Home/Away", "Draw/Away" (sometimes "1X","12","X2")
      if (name === "Double Chance") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase().replace(/\s/g, "");
          const odd = Number(v.odd);
          if (val === "home/draw" || val === "1x") push("double_chance", "HOME_OR_DRAW", odd);
          else if (val === "home/away" || val === "12") push("double_chance", "HOME_OR_AWAY", odd);
          else if (val === "draw/away" || val === "x2") push("double_chance", "DRAW_OR_AWAY", odd);
        }
        continue;
      }

      if (name === "Draw No Bet" || name === "DNB") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "home" || val === "1") push("draw_no_bet", "HOME", odd);
          else if (val === "away" || val === "2") push("draw_no_bet", "AWAY", odd);
        }
        continue;
      }

      if (name === "Odd/Even" || name === "Total - Odd/Even" || name === "Odd Even") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "odd") push("goals_odd_even", "ODD", odd);
          else if (val === "even") push("goals_odd_even", "EVEN", odd);
        }
        continue;
      }

      // Clean Sheet — sometimes split per side, sometimes combined values
      if (name === "Clean Sheet - Home" || name === "Home Team Clean Sheet") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "yes") push("clean_sheet_home", "YES", odd);
          else if (val === "no") push("clean_sheet_home", "NO", odd);
        }
        continue;
      }
      if (name === "Clean Sheet - Away" || name === "Away Team Clean Sheet") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "yes") push("clean_sheet_away", "YES", odd);
          else if (val === "no") push("clean_sheet_away", "NO", odd);
        }
        continue;
      }

      if (name === "Win to Nil - Home" || name === "Home Win to Nil") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "yes") push("win_to_nil_home", "YES", odd);
          else if (val === "no") push("win_to_nil_home", "NO", odd);
        }
        continue;
      }
      if (name === "Win to Nil - Away" || name === "Away Win to Nil") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "yes") push("win_to_nil_away", "YES", odd);
          else if (val === "no") push("win_to_nil_away", "NO", odd);
        }
        continue;
      }

      if (name === "Both Teams Score" || name === "Both Teams To Score") {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "yes") push("btts", "YES", odd);
          else if (val === "no") push("btts", "NO", odd);
        }
        continue;
      }

      if (name === "Exact Score" || name === "Correct Score") {
        for (const v of bet.values ?? []) {
          const key = normalizeCs(String(v.value));
          if (!key) continue;
          push("correct_score", key, Number(v.odd));
        }
        continue;
      }

      if (name === "HT/FT Double" || name === "Half Time/Full Time" || name === "Halftime/Fulltime") {
        for (const v of bet.values ?? []) {
          const key = HTFT_MAP[String(v.value).trim()];
          if (!key) continue;
          push("half_time_full_time", key, Number(v.odd));
        }
        continue;
      }

      if (name === "Exact Goals Number" || name === "Total - Exact") {
        for (const v of bet.values ?? []) {
          const key = normalizeExactGoals(String(v.value));
          if (!key) continue;
          push("exact_total_goals", key, Number(v.odd));
        }
        continue;
      }

      // To Qualify / Advance — knockout only. API-Football names vary across
      // markets ("To Qualify", "Home/Away", "Qualification", "Team to Qualify").
      // Values are typically "Home"/"Away" (sometimes "1"/"2").
      if (
        name === "To Qualify" ||
        name === "Qualification" ||
        name === "Team to Qualify" ||
        name === "Home/Away" ||
        name === "Home-Away"
      ) {
        for (const v of bet.values ?? []) {
          const val = String(v.value).trim().toLowerCase();
          const odd = Number(v.odd);
          if (val === "home" || val === "1") push("to_qualify", "HOME", odd);
          else if (val === "away" || val === "2") push("to_qualify", "AWAY", odd);
        }
        continue;
      }
    }
  }

  const ref: ParsedRef | null =
    refHome.length && refDraw.length && refAway.length
      ? {
          home: Number(median(refHome).toFixed(2)),
          draw: Number(median(refDraw).toFixed(2)),
          away: Number(median(refAway).toFixed(2)),
        }
      : null;

  const odds: ParsedOdds[] = [];
  for (const [k, prices] of buckets) {
    const [market, selection] = k.split("|") as [ParsedOdds["market"], string];
    odds.push({ market, selection, odds: Number(median(prices).toFixed(2)) });
  }

  return { ref, odds, bookmakerCount: (bookmakers ?? []).length };
}
