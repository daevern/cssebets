// Central football competition config. Runtime `enabled` state comes from the
// sports_feature_flags table; this file is the immutable metadata catalog.

export type FootballCompetitionCode = "EPL" | "LA_LIGA" | "SERIE_A" | "UCL";

export type FootballCompetitionConfig = {
  code: FootballCompetitionCode;
  displayName: string;
  shortName: string;
  country: string;
  apiFootballLeagueId: number;
  oddsApiSportKey: string; // reserved; not used in Phase 1 (we use API-Football odds)
  currentSeason: number;   // API-Football uses starting year of season
  featureFlagKey:
    | "epl_enabled"
    | "la_liga_enabled"
    | "serie_a_enabled"
    | "ucl_enabled";
  routePath: string;
};

export const FOOTBALL_COMPETITIONS: Record<
  FootballCompetitionCode,
  FootballCompetitionConfig
> = {
  EPL: {
    code: "EPL",
    displayName: "English Premier League",
    shortName: "EPL",
    country: "England",
    apiFootballLeagueId: 39,
    oddsApiSportKey: "soccer_epl",
    currentSeason: 2025,
    featureFlagKey: "epl_enabled",
    routePath: "/football/epl",
  },
  LA_LIGA: {
    code: "LA_LIGA",
    displayName: "La Liga",
    shortName: "La Liga",
    country: "Spain",
    apiFootballLeagueId: 140,
    oddsApiSportKey: "soccer_spain_la_liga",
    currentSeason: 2025,
    featureFlagKey: "la_liga_enabled",
    routePath: "/football/la-liga",
  },
  SERIE_A: {
    code: "SERIE_A",
    displayName: "Serie A",
    shortName: "Serie A",
    country: "Italy",
    apiFootballLeagueId: 135,
    oddsApiSportKey: "soccer_italy_serie_a",
    currentSeason: 2025,
    featureFlagKey: "serie_a_enabled",
    routePath: "/football/serie-a",
  },
  UCL: {
    code: "UCL",
    displayName: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    apiFootballLeagueId: 2,
    oddsApiSportKey: "soccer_uefa_champs_league",
    currentSeason: 2025,
    featureFlagKey: "ucl_enabled",
    routePath: "/football/ucl",
  },
};

export const ALL_FOOTBALL_COMPETITIONS = Object.values(FOOTBALL_COMPETITIONS);
