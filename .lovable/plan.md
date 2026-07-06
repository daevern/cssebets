## What's happening

The match `Brazil 1–2 Norway` is `finished`, and the standard score-based markets (`over_under_2_5`, `double_chance`) settled correctly. Only cards/corners markets on that match are still pending:

- `cards_over_under_3_5` OVER_3_5 — 150
- `corners_over_under_9_5` OVER_9_5 — 150
- `corners_over_under_10_5` OVER_10_5 — 100

## Root cause

`settle_cards_corners_for_match` gates every prediction behind a "stats freshness" check:

```
v_home_stats_fresh := status='finished' AND
  (matches.home_corners IS NOT NULL
   OR match_stats.fetched_at >= matches.updated_at - interval '2 minutes')
```

For this match:
- `matches.home_corners` / `away_corners` / `home_cards` / `away_cards` are all `NULL` (sync never backfills them onto `matches`).
- `match_stats.fetched_at = 2026-07-05 21:37:04` (last live sync during the game).
- `matches.updated_at = 2026-07-06 03:38:03` (later admin/sync touch on the match row).

Stats are ~6 hours older than `updated_at`, so `v_stats_fresh` is false and the settler `CONTINUE`s past every corners/cards prediction, leaving them pending forever. This is a systemic bug — any finished match whose row is touched after the last stats sync hits the same trap.

## Data check on what SHOULD happen

- Corners in `match_stats`: home 3 + away 4 = **7**.
  - OVER_9_5 needs ≥10 → **LOST**
  - OVER_10_5 needs ≥11 → **LOST**
- Cards: `yellow_cards`/`red_cards` are `NULL` in `match_stats` (never populated for this match). Under current rules the settler would **VOID** the cards prediction, refunding stake.

## Plan

### 1. Fix the settler's freshness gate (migration)

Rewrite the freshness condition so it no longer depends on `matches.updated_at`. New rule: stats are considered fresh for a finished match if `match_stats` rows exist for both sides AND their `fetched_at` is on/after the match's `kickoff_at` (or `matches.home_corners`/`home_cards` are populated). This retains the guard against pre-match empty stats while removing the false negative caused by later touches to the match row.

Same change applies to `v_events_present` (currently also compares to `updated_at`): switch to "any event row for this match with `created_at >= kickoff_at`".

### 2. Re-run settlement for the affected match

After the migration, call `settle_cards_corners_for_match('2a2e429d-…')`. Expected result:
- Both corners predictions → `lost`.
- Cards prediction → `void` (cards stats missing), stake refunded to wallet.

I'll verify by re-selecting the three predictions and confirming `status` moved off `pending` and wallets reconcile.

### 3. Sweep other affected matches

Run the same settler across any other `finished` matches that still have pending cards/corners predictions, so this backlog clears in one pass.

### Out of scope

- Backfilling actual card counts from `match_events` for matches where `match_stats.yellow_cards` is NULL — separate follow-up if you want cards markets to grade on results instead of voiding.
- Changing the sync to also mirror corners/cards onto the `matches` table (would also fix this, but is a bigger change than the settler patch).
