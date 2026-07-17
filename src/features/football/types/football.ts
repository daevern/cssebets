import type { FootballCompetitionCode } from "../config/footballCompetitions";

export type FootballEventStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "abandoned";

export type FootballMatch = {
  id: string;
  competitionCode: FootballCompetitionCode;
  competitionName: string;
  season: string | null;
  round: string | null;
  kickoffAt: string;
  status: FootballEventStatus;
  liveMinute: number | null;
  venue: string | null;
  home: {
    name: string;
    shortName: string | null;
    logo: string | null;
    score: number | null;
  };
  away: {
    name: string;
    shortName: string | null;
    logo: string | null;
    score: number | null;
  };
};

export type FootballSelection = {
  id: string;
  key: string;
  displayName: string;
  odds: number;
  line: number | null;
  status: "open" | "suspended" | "closed";
};

export type FootballMarket = {
  id: string;
  key: string;
  displayName: string;
  category: string;
  period: string;
  line: number | null;
  status: "open" | "suspended" | "closed" | "settled" | "void";
  selections: FootballSelection[];
};

export type FootballBet = {
  id: string;
  eventId: string;
  marketKey: string;
  selectionKey: string;
  selectionDisplay: string;
  stake: number;
  acceptedOdds: number;
  potentialPayout: number;
  actualPayout: number | null;
  status: "pending" | "won" | "lost" | "void" | "refunded" | "cancelled";
  placedAt: string;
  settledAt: string | null;
};
