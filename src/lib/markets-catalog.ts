// Shared catalog: market keys, labels, selection lists. Safe to import on client.

export type MarketKey =
  | "over_under_2_5"
  | "btts"
  | "correct_score"
  | "half_time_full_time"
  | "exact_total_goals"
  | "to_qualify";

export const MARKET_LABELS: Record<MarketKey, string> = {
  over_under_2_5: "Over / Under 2.5 Goals",
  btts: "Both Teams To Score",
  correct_score: "Score",
  half_time_full_time: "Half-Time / Full-Time",
  exact_total_goals: "Exact Total Goals",
  to_qualify: "To Qualify / Advance",
};

export const SELECTION_LABELS: Record<string, string> = {
  OVER_2_5: "Over 2.5",
  UNDER_2_5: "Under 2.5",
  YES: "Yes",
  NO: "No",
  OTHER: "Other score",
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
};

export function selectionLabel(sel: string): string {
  return SELECTION_LABELS[sel] ?? sel;
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
