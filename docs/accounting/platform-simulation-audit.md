# CSSEBets — Platform Simulation Audit

Non-destructive audit of accounting correctness, arcade house edges, provable
fairness, server authority and tamper resistance. No production data was
mutated: every check was read-only SQL, offline Monte-Carlo simulation, or a
SIMULATION-environment self-test that rolls itself back.

**Overall verdict: PASS WITH WARNINGS — safe to operate, with two items to fix
before scaling stakes.**

---

## 1. Accounting correctness — PASS

| Check | Result |
| --- | --- |
| Posted journals balanced (debits = credits) | 2,961 / 2,961 balanced, trial balance 0.00 |
| Line arithmetic (`balance_after − balance_before = signed_effect`) | pass |
| Cached account balances = latest posted line | pass |
| Negative wallet balances | none |
| Duplicate settlement journals | none |
| Orphan journals | none |
| Liability reservations released on terminal status | pass |

Production ledger snapshot at audit time:

| Account | Balance |
| --- | --- |
| HOUSE_BANKROLL | 53,219.48 |
| PAYOUTS_PAYABLE | 1,402.95 |
| Plinko stake revenue / payout expense | 1,461.00 / 1,428.30 |
| Roulette | 1,165.00 / 1,030.00 |
| Blackjack | 1,900.00 / 1,775.00 |
| Treasure | 300.00 / 189.00 |

Known, accepted residue: 369 pre-journal-era wallet chain breaks (legacy manual
adjustments written before `balance_before`/`balance_after` were enforced). New
breaks must stay at 0.

**Open item (low):** one wallet (`38b0b5aa…`) shows 99.40 against a last ledger
row of 99.00 — a 0.40 drift from the legacy era, not a live posting bug.

**Open item (low):** six 2026-07-31 journals mix SIMULATION accounts into
PRODUCTION journals — test residue; they do not affect the trial balance.

---

## 2. House edge and RTP — PASS WITH WARNINGS

Verified by 1M-round Monte Carlo per game plus closed-form derivation, using the
live database configs.

| Game | Theoretical RTP | Simulated RTP | House edge |
| --- | --- | --- | --- |
| Plinko | 0.989–0.991 (per risk profile) | 0.9897 | ~1.0% |
| Roulette (European, 37 pockets) | 36/37 = 0.97297 | 0.9731 | 2.70% |
| Rock–Paper–Scissors | 0.9667 per round (1.9x win, 1.0x draw) | 0.9664 | 3.33% |
| Treasure Grid | 0.96 target | 0.96 (shallow), collapses when capped | 4.0% |
| Blackjack (6D, S17, DAS, BJ 3:2) | ~0.9960 basic strategy | 0.9964 (1.8M hands) | ~0.36% |

Roulette pays the same 36/37 RTP for every legal coverage (1, 2, 3, 4, 6, 12,
18) — no arbitrage pocket exists.

**Warning (medium) — Treasure Grid deep-ladder RTP collapse.** `actualMultiplier`
caps at 5,000x. On hard grids the fair multiplier passes that ceiling well before
the ladder ends, so RTP falls from 0.96 toward ~0.004 at maximum depth. This is
house-favourable, never player-favourable, but it is a silent, undisclosed
deviation from the published 96% RTP. Either cut the reachable ladder depth to
where the cap never binds, or display the capped multiplier so the player sees
the real payout before revealing.

**Warning (low) — Blackjack margin is thin.** A 0.36% edge means a skilled player
plus the score-ladder bonuses can run near break-even; blackjack is the one game
where variance, not edge, drives short-run results. Keep table maxima modest.

---

## 3. Provable fairness — PASS

All arcade outcomes derive from
`hmac(client_seed || nonce || round_id, server_seed, 'sha256')`, with rejection
sampling to remove modulo bias. Seeds are committed (hashed) before play and
revealed after settlement.

- 1,200+ historical rounds (RPS, Plinko, Roulette) were replayed from revealed
  seeds: **100% reproduced the stored outcome**.
- Blackjack shoes carry commit → reveal → verify state with an explicit
  `VERIFICATION_FAILED` status; no shoe is in that state.
- Treasure Grid verification is restored and reproduces trap layouts.

---

## 4. Server authority — PASS

- Every arcade endpoint is a `createServerFn` behind `requireSupabaseAuth`; the
  acting user is taken from the verified token (`context.userId`), never from
  the request body.
- Stakes, multipliers, outcomes and payouts are computed inside `SECURITY
  DEFINER` database functions and stored server-side. Client-supplied
  multipliers, returns, tile results and balances are ignored everywhere.
- Football bets: the client's odds are only a staleness check (±15%); the odds
  actually used come from `matches.reference_odds` / the latest snapshot.
- UFC and F1 bets: odds are read from the market row server-side; the client
  cannot supply odds at all.
- Bet placement is atomic (`place_bet_atomic`) with an idempotency key, so a
  replayed submission returns the original bet instead of charging twice.
- Settlements are guarded by `settlement_journal` unique claims (`ALREADY_SETTLED`,
  SQLSTATE P0409) and immutability triggers on settled rounds.

---

## 5. Concurrency and exposure — WARNING

Reserve decisions serialise correctly:
`accounting_available_reserve_locked()` takes an advisory transaction lock plus
`SELECT … FOR UPDATE` on the bankroll balance row, so simultaneous rounds are
evaluated one at a time and the reserve is recomputed after the lock.

**Resolved (Phase A) — capacity checks enforced for all arcade products.**
Migration `20260806120500_phase_a_arcade_capacity_enforced` sets
`capacity_enforced=true` for plinko, rps, blackjack, roulette, and treasure.
`arcade_config_selftest` fails if any liability-enforced arcade product still
has `capacity_enforced=false`. Over-limit rounds are rejected; raise bankroll
or per-product ceilings rather than disabling the guard.

---

## 6. Profitability outlook

Blended house edge across current arcade volume (≈21,200 points staked) is
~1.9%. At the present 53,219 bankroll and observed stake sizes, risk of ruin is
negligible **provided** capacity enforcement is switched back on; with it off, a
single oversized Blackjack or Treasure round can exceed available reserve.

---

## 7. How to re-run this audit

- **Admin UI:** Management → *Audit suite* → **Run full audit**. This executes
  the whole battery (`accounting_phase10_selftest`, ledger invariants, rounding
  policy, arcade lifecycles, liability integrity, blackjack ceiling, integrity
  scan, bankroll reconciliation) and renders per-suite pass/fail with raw JSON.
- **Code regression:** `bunx vitest run src/lib/arcade/__tests__/house-edge.test.ts`
  — guards RTP ceilings, roulette coverage parity, the RPS outcome matrix, the
  Treasure cap deviation, and the monetary rounding policy.

---

## 8. Prioritised remediation list

1. **Done (Phase A)** — `capacity_enforced` re-enabled for all arcade products;
   adjust bankroll/ceilings rather than disabling the guard.
2. **Medium** — fix the Treasure Grid 5,000x cap (limit depth or disclose the
   capped multiplier).
3. **Low** — clean up the six cross-environment journals from 2026-07-31.
4. **Low** — reconcile the single 0.40 legacy wallet drift.
5. **Low** — keep Blackjack table maxima conservative while the edge is 0.36%.
