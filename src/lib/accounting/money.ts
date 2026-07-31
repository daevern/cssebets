/**
 * Phase 8 — Global monetary rounding policy (client + server mirror of the DB helpers).
 *
 * Single source of truth for how points money is rounded across the platform:
 *  - Scale: 2 decimal places, always.
 *  - Mode: half-up (away from zero), matching Postgres `round(numeric, 2)`.
 *  - Liability/exposure: always rounded UP so the house never under-reserves.
 *
 * The database is authoritative (see `acct_round_money`, `acct_round_stake`,
 * `acct_round_payout`, `acct_round_liability` and `accounting_phase8_selftest`).
 * These helpers exist so UI/server-function arithmetic never disagrees with it.
 */

export const MONEY_SCALE = 2;

const FACTOR = 10 ** MONEY_SCALE;

/** Half-up rounding to 2dp, away from zero (mirrors Postgres numeric round). */
export function roundMoney(value: number | null | undefined): number {
  const v = Number(value ?? 0);
  if (!Number.isFinite(v)) return 0;
  const scaled = v * FACTOR;
  // epsilon guards binary-float artefacts such as 1.005 * 100 = 100.49999999999999
  const nudged = scaled >= 0 ? scaled + 1e-9 : scaled - 1e-9;
  return (v >= 0 ? Math.floor(nudged + 0.5) : Math.ceil(nudged - 0.5)) / FACTOR;
}

/** Stake collected from a player. */
export const roundStake = roundMoney;

/** Payout owed to a player; residual cents are retained as house P/L. */
export const roundPayout = roundMoney;

/** Exposure / liability figures — always rounded up. */
export function roundLiability(value: number | null | undefined): number {
  const v = Number(value ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.ceil(v * FACTOR - 1e-9) / FACTOR;
}

/** True when a value already respects the 2dp policy. */
export function isMoneyScaleOk(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return Math.abs(roundMoney(value) - value) < 1e-9;
}

/** Potential return for a decimal-odds bet, rounded per policy. */
export function potentialPayout(stake: number, decimalOdds: number): number {
  return roundPayout(roundStake(stake) * decimalOdds);
}

/** Display helper: fixed 2dp string with thousands separators. */
export function formatPoints(value: number | null | undefined): string {
  return roundMoney(value).toLocaleString(undefined, {
    minimumFractionDigits: MONEY_SCALE,
    maximumFractionDigits: MONEY_SCALE,
  });
}
