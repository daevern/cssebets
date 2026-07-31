# Phase 7 — Blackjack payout-cap fix

Status: **complete**. `SELECT public.arcade_bj_phase7_selftest();` → 9/9 pass
(rule config v1, table ceiling 8,000.00).

## The defect

```sql
IF total_pay > rc.max_payout THEN total_pay := rc.max_payout;
```

Settlement silently credited less than the sum of the individual player-hand
payout records. The hand row, the player-hand rows and the wallet credit could
all disagree, and the player absorbed the difference with no disclosure.

## The rule now enforced

**Money is never truncated at settlement.** `max_payout` is a genuine *pre-deal*
ceiling, tested before the stake is taken.

### Pre-deal exposure test — `arcade_bj_worst_case_gross(rule_config, stake)`

Walks the complete legal state tree for the table rules:

| Rule | Contribution |
| --- | --- |
| `max_split_hands` | every hand simultaneously live |
| `double_allowed` / `double_after_split` | every live hand carrying a doubled stake (or only the unsplit hand when DAS is off) |
| `blackjack_payout` | a natural on the unsplit hand |

```
worst_case_gross = max( stake × hands × double_factor × 2,
                        stake × (1 + blackjack_payout) )
```

There is no insurance or side bet in this implementation, so nothing else can
add exposure. At the current config: 500 × 4 × 2 × 2 = **8,000.00**, exactly the
table ceiling.

`arcade_bj_start_hand` then, **before consuming the stake**:

1. rejects with `EXPOSURE_LIMIT` if `worst_case_gross > max_payout`;
2. calls `arcade_bj_assert_capacity` → `accounting_arcade_assert_capacity`,
   rejecting with insufficient house capacity if the available bankroll
   (Phase 6 formula) cannot support the worst case;
3. reserves the full worst case as liability for the life of the hand;
4. persists it on the hand as `worst_case_gross` for audit.

Because the reservation already assumes maximum splits and doubles, no later
action can add unreserved exposure — the player never has an action disabled
mid-hand for capacity reasons.

### Settlement invariants

```
sum(player_hand.payout) = hand.total_payout = wallet credit
```
Any mismatch raises `PAYOUT_MISMATCH` (an internal-consistency bug, not a player
outcome).

If `total_payout > max_payout` at settlement, the exposure model is unsound. The
player is still **paid in full**, and settlement records:

- `arcade_bj_hands.payout_ceiling_breached = true`
- a `critical` / `accounting` row in `operational_alerts`
- a `payout_ceiling_breach` risk flag in `arcade_bj_risk_flags`

## Score cap is non-monetary and disclosed

`max_score_per_round` still applies, but it is no longer silent:

- `arcade_bj_hands.total_score_uncapped` — sum before the cap
- `arcade_bj_hands.score_cap_delta` — points removed
- the score-ledger `reason` states the cap and the amount not awarded

Score is arcade points, not virtual currency, and never touches the wallet or
the house journal.

## Reservation accuracy on double / split

Double and split collect additional stake. `arcade_bj_resync_reservation` now
re-reserves with the unchanged worst-case gross and the newly collected total
stake, so `max_net_liability = worst_case_gross − stake_collected` stays exact
(previously the reservation over-held by the extra stake).

## Self-test

`public.arcade_bj_phase7_selftest()` (admin-only) asserts:

1. worst case at max stake ≤ table ceiling
2. worst case ≥ natural blackjack payout
3. worst case ≥ every split hand doubled and winning
4. `arcade_bj_settle` source contains no payout truncation
5. sum of player-hand payouts = hand payout, for every completed hand
6. hand payout = wallet credit, for every completed hand
7. any ceiling breach is flagged
8. every applied score cap is disclosed
9. active reservations track the stake actually collected
