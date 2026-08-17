/**
 * Settle-path helpers — client mirrors of how points leave / return on settlement.
 *
 * The database is authoritative. These exist so unit tests can lock the
 * accounting identities (gross return, user net, win/loss) without a live RPC.
 */
import { potentialPayout, roundMoney, roundPayout, roundStake } from "@/lib/accounting/money";

export type SettleOutcome = "WIN" | "LOSS" | "PUSH" | "VOID";

export type SettledRound = {
  stake: number;
  multiplier: number;
  grossReturn: number;
  userNet: number;
  outcome: SettleOutcome;
};

/**
 * Arcade mini / multiplier settle (dice, hi-lo cashout, wheel, keno, crash,
 * towers, plinko slot): gross = round(stake × multiplier, 2), net = gross − stake.
 * Outcome: WIN when multiplier ≥ 1, else LOSS (partial returns like 0.2× still LOSS).
 */
export function settleMultiplierRound(stake: number, multiplier: number): SettledRound {
  const s = roundStake(stake);
  const m = Math.max(0, Number(multiplier) || 0);
  const grossReturn = roundPayout(s * m);
  const userNet = roundMoney(grossReturn - s);
  const outcome: SettleOutcome = m >= 1 ? "WIN" : "LOSS";
  return { stake: s, multiplier: m, grossReturn, userNet, outcome };
}

/** Treasure Grid uses floor(stake × mult) for integer virtual points. */
export function settleTreasureRound(stake: number, multiplier: number): SettledRound {
  const s = roundStake(stake);
  const m = Math.max(0, Number(multiplier) || 0);
  const grossReturn = Math.floor(s * m);
  const userNet = roundMoney(grossReturn - s);
  const outcome: SettleOutcome = m >= 1 && grossReturn > 0 ? "WIN" : "LOSS";
  return { stake: s, multiplier: m, grossReturn, userNet, outcome };
}

/**
 * Sports decimal-odds settle.
 * WIN → gross = stake × odds; LOSS → 0; PUSH/VOID → stake returned (net 0).
 */
export function settleSportsBet(
  stake: number,
  decimalOdds: number,
  result: "win" | "lose" | "push" | "void",
): SettledRound {
  const s = roundStake(stake);
  if (result === "void" || result === "push") {
    return {
      stake: s,
      multiplier: 1,
      grossReturn: s,
      userNet: 0,
      outcome: result === "void" ? "VOID" : "PUSH",
    };
  }
  if (result === "lose") {
    return { stake: s, multiplier: 0, grossReturn: 0, userNet: roundMoney(-s), outcome: "LOSS" };
  }
  const grossReturn = potentialPayout(s, decimalOdds);
  return {
    stake: s,
    multiplier: s > 0 ? roundMoney(grossReturn / s) : 0,
    grossReturn,
    userNet: roundMoney(grossReturn - s),
    outcome: "WIN",
  };
}

/** Invariants every settled round must satisfy. */
export function assertSettleIdentity(r: SettledRound): void {
  if (r.outcome === "VOID" || r.outcome === "PUSH") {
    if (r.grossReturn !== r.stake) throw new Error("void/push must return stake");
    if (r.userNet !== 0) throw new Error("void/push net must be 0");
    return;
  }
  if (roundMoney(r.grossReturn - r.stake) !== r.userNet) {
    throw new Error(`userNet identity broken: ${r.grossReturn} - ${r.stake} !== ${r.userNet}`);
  }
  if (r.outcome === "LOSS" && r.multiplier >= 1) {
    throw new Error("LOSS cannot have multiplier ≥ 1");
  }
  if (r.outcome === "WIN" && r.multiplier < 1) {
    throw new Error("WIN requires multiplier ≥ 1");
  }
}
