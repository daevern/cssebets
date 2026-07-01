// Shared catalog: market keys, labels, selection lists. Safe to import on client.

export type MarketKey =
  | "over_under_0_5"
  | "over_under_1_5"
  | "over_under_2_5"
  | "over_under_3_5"
  | "over_under_4_5"
  | "over_under_5_5"
  | "over_under_6_5"
  | "btts"
  | "correct_score"
  | "half_time_full_time"
  | "exact_total_goals"
  | "to_qualify"
  | "double_chance"
  | "draw_no_bet"
  | "goals_odd_even"
  | "clean_sheet_home"
  | "clean_sheet_away"
  | "win_to_nil_home"
  | "win_to_nil_away"
  // Cards
  | "cards_over_under_2_5"
  | "cards_over_under_3_5"
  | "cards_over_under_4_5"
  | "cards_over_under_5_5"
  | "home_cards_over_under_1_5"
  | "away_cards_over_under_1_5"
  | "red_card_match"
  | "first_card"
  // Corners
  | "corners_over_under_8_5"
  | "corners_over_under_9_5"
  | "corners_over_under_10_5"
  | "corners_over_under_11_5"
  | "home_corners_over_under_4_5"
  | "away_corners_over_under_4_5"
  | "first_corner";

export const OVER_UNDER_LINES = [
  "over_under_0_5",
  "over_under_1_5",
  "over_under_2_5",
  "over_under_3_5",
  "over_under_4_5",
  "over_under_5_5",
  "over_under_6_5",
] as const;

export const CARDS_LINES = [
  "cards_over_under_2_5",
  "cards_over_under_3_5",
  "cards_over_under_4_5",
  "cards_over_under_5_5",
] as const;

export const CORNERS_LINES = [
  "corners_over_under_8_5",
  "corners_over_under_9_5",
  "corners_over_under_10_5",
  "corners_over_under_11_5",
] as const;

export const MARKET_LABELS: Record<MarketKey, string> = {
  over_under_0_5: "Over / Under 0.5 Goals",
  over_under_1_5: "Over / Under 1.5 Goals",
  over_under_2_5: "Over / Under 2.5 Goals",
  over_under_3_5: "Over / Under 3.5 Goals",
  over_under_4_5: "Over / Under 4.5 Goals",
  over_under_5_5: "Over / Under 5.5 Goals",
  over_under_6_5: "Over / Under 6.5 Goals",
  btts: "Both Teams To Score",
  correct_score: "Score",
  half_time_full_time: "Half-Time / Full-Time",
  exact_total_goals: "Exact Total Goals",
  to_qualify: "To Qualify / Advance",
  double_chance: "Double Chance",
  draw_no_bet: "Draw No Bet",
  goals_odd_even: "Total Goals Odd / Even",
  clean_sheet_home: "Home Clean Sheet",
  clean_sheet_away: "Away Clean Sheet",
  win_to_nil_home: "Home Win to Nil",
  win_to_nil_away: "Away Win to Nil",
  cards_over_under_2_5: "Total Cards Over / Under 2.5",
  cards_over_under_3_5: "Total Cards Over / Under 3.5",
  cards_over_under_4_5: "Total Cards Over / Under 4.5",
  cards_over_under_5_5: "Total Cards Over / Under 5.5",
  home_cards_over_under_1_5: "Home Cards Over / Under 1.5",
  away_cards_over_under_1_5: "Away Cards Over / Under 1.5",
  red_card_match: "Red Card in Match",
  first_card: "First Team Carded",
  corners_over_under_8_5: "Total Corners Over / Under 8.5",
  corners_over_under_9_5: "Total Corners Over / Under 9.5",
  corners_over_under_10_5: "Total Corners Over / Under 10.5",
  corners_over_under_11_5: "Total Corners Over / Under 11.5",
  home_corners_over_under_4_5: "Home Corners Over / Under 4.5",
  away_corners_over_under_4_5: "Away Corners Over / Under 4.5",
  first_corner: "First Corner",
};

export const SELECTION_LABELS: Record<string, string> = {
  OVER_0_5: "Over 0.5", UNDER_0_5: "Under 0.5",
  OVER_1_5: "Over 1.5", UNDER_1_5: "Under 1.5",
  OVER_2_5: "Over 2.5", UNDER_2_5: "Under 2.5",
  OVER_3_5: "Over 3.5", UNDER_3_5: "Under 3.5",
  OVER_4_5: "Over 4.5", UNDER_4_5: "Under 4.5",
  OVER_5_5: "Over 5.5", UNDER_5_5: "Under 5.5",
  OVER_6_5: "Over 6.5", UNDER_6_5: "Under 6.5",
  OVER_8_5: "Over 8.5", UNDER_8_5: "Under 8.5",
  OVER_9_5: "Over 9.5", UNDER_9_5: "Under 9.5",
  OVER_10_5: "Over 10.5", UNDER_10_5: "Under 10.5",
  OVER_11_5: "Over 11.5", UNDER_11_5: "Under 11.5",
  YES: "Yes",
  NO: "No",
  NONE: "No card / corner",
  OTHER: "Other score",
  ODD: "Odd",
  EVEN: "Even",
  GOALS_0: "0 goals",
  GOALS_1: "1 goal",
  GOALS_2: "2 goals",
  GOALS_3: "3 goals",
  GOALS_4: "4 goals",
  GOALS_5_PLUS: "5+ goals",
  HOME_HOME: "Home / Home",
  HOME_DRAW: "Home / Draw",
  HOME_AWAY: "Home / Away",
  DRAW_HOME: "Draw / Home",
  DRAW_DRAW: "Draw / Draw",
  DRAW_AWAY: "Draw / Away",
  AWAY_HOME: "Away / Home",
  AWAY_DRAW: "Away / Draw",
  AWAY_AWAY: "Away / Away",
  HOME: "Home",
  AWAY: "Away",
  HOME_OR_DRAW: "Home or Draw",
  HOME_OR_AWAY: "Home or Away",
  DRAW_OR_AWAY: "Draw or Away",
};

export function selectionLabel(sel: string): string {
  return SELECTION_LABELS[sel] ?? sel;
}

// Question-style market titles for the prediction-market UI.
// {home} / {away} are replaced with team names at render time.
export const MARKET_QUESTIONS: Record<MarketKey, string> = {
  over_under_0_5: "Will there be a goal?",
  over_under_1_5: "Will there be over 1.5 goals?",
  over_under_2_5: "Will there be over 2.5 goals?",
  over_under_3_5: "Will there be over 3.5 goals?",
  over_under_4_5: "Will there be over 4.5 goals?",
  over_under_5_5: "Will there be over 5.5 goals?",
  over_under_6_5: "Will there be over 6.5 goals?",
  btts: "Will both teams score?",
  correct_score: "What will the final score be?",
  half_time_full_time: "How will half-time and full-time land?",
  exact_total_goals: "How many goals will be scored?",
  to_qualify: "Who will advance?",
  double_chance: "Double chance — pick two outcomes to cover",
  draw_no_bet: "Who wins? (draw refunds)",
  goals_odd_even: "Will total goals be odd or even?",
  clean_sheet_home: "Will {home} keep a clean sheet?",
  clean_sheet_away: "Will {away} keep a clean sheet?",
  win_to_nil_home: "Will {home} win to nil?",
  win_to_nil_away: "Will {away} win to nil?",
  cards_over_under_2_5: "Will there be over 2.5 cards?",
  cards_over_under_3_5: "Will there be over 3.5 cards?",
  cards_over_under_4_5: "Will there be over 4.5 cards?",
  cards_over_under_5_5: "Will there be over 5.5 cards?",
  home_cards_over_under_1_5: "Will {home} pick up over 1.5 cards?",
  away_cards_over_under_1_5: "Will {away} pick up over 1.5 cards?",
  red_card_match: "Will there be a red card?",
  first_card: "Who gets the first card?",
  corners_over_under_8_5: "Will there be over 8.5 corners?",
  corners_over_under_9_5: "Will there be over 9.5 corners?",
  corners_over_under_10_5: "Will there be over 10.5 corners?",
  corners_over_under_11_5: "Will there be over 11.5 corners?",
  home_corners_over_under_4_5: "Will {home} win over 4.5 corners?",
  away_corners_over_under_4_5: "Will {away} win over 4.5 corners?",
  first_corner: "Who wins the first corner?",
};

export function marketQuestion(
  market: MarketKey,
  home?: string,
  away?: string,
): string {
  const q = MARKET_QUESTIONS[market] ?? MARKET_LABELS[market];
  return q.replace(/\{home\}/g, home ?? "Home").replace(/\{away\}/g, away ?? "Away");
}

export function impliedProbability(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;
  return Math.round((1 / multiplier) * 100);
}

export const CORRECT_SCORES = [
  "0-0","1-0","0-1","1-1","2-0","0-2","2-1","1-2","2-2",
  "3-0","0-3","3-1","1-3","3-2","2-3","3-3",
  "4-0","0-4","4-1","1-4","4-2","2-4","OTHER",
];

export const HTFT_OPTIONS = [
  "HOME_HOME","HOME_DRAW","HOME_AWAY",
  "DRAW_HOME","DRAW_DRAW","DRAW_AWAY",
  "AWAY_HOME","AWAY_DRAW","AWAY_AWAY",
];

export const EXACT_GOALS_OPTIONS = ["GOALS_0","GOALS_1","GOALS_2","GOALS_3","GOALS_4","GOALS_5_PLUS"];

// Curated shortlist of markets surfaced to users. Retired markets remain typed
// (so historical tickets keep their labels and continue to settle) but are
// hidden from the bet slip. Edit this set to expand/retract the live offering.
export const ACTIVE_MARKETS: ReadonlySet<MarketKey> = new Set<MarketKey>([
  // Match result family
  "to_qualify",
  "double_chance",
  "draw_no_bet",
  "half_time_full_time",
  // Goals — keep only the three standard lines
  "over_under_1_5",
  "over_under_2_5",
  "over_under_3_5",
  "btts",
  "correct_score",
  "goals_odd_even",
  "clean_sheet_home",
  "clean_sheet_away",
  // Cards — middle lines only
  "cards_over_under_3_5",
  "cards_over_under_4_5",
  "red_card_match",
  // Corners — middle lines + team specials
  "corners_over_under_9_5",
  "corners_over_under_10_5",
  "home_corners_over_under_4_5",
  "away_corners_over_under_4_5",
]);

export function isMarketActive(market: string): boolean {
  return ACTIVE_MARKETS.has(market as MarketKey);
}
