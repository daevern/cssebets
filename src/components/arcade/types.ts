export type RiskMode = "low" | "medium" | "high";
export type RowsCount = 8 | 10 | 12 | 14 | 16;

export type PlinkoSlot = { slot_index: number; score: number; multiplier: number };

export type PlinkoProfile = {
  id: string;
  rows: number;
  risk_mode: RiskMode;
  version: number;
  slots: PlinkoSlot[];
};

export type PlinkoGame = {
  id: string;
  rows: number;
  risk_mode: RiskMode;
  path: number[];
  landing_slot: number;
  score: number;
  outcome: "WIN" | "LOSS" | "VOID" | "REVERSED" | "PENDING" | "ERROR";
  score_band: "ZERO" | "LOW" | "STANDARD" | "HIGH" | "RARE" | "JACKPOT";
  verification_id: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  created_at: string;
  stake_per_ball: number;
  multiplier: number;
  payout: number;
};
