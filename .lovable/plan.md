# Cloud performance: cut disk IO without upgrading the instance

The database is doing far more write work than the product needs. Almost all of the load comes from three "history" tables that grow forever, one admin query with no matching index, and four duplicate cron jobs firing at the same second.

## What the audit found

Table sizes (total 1.2 GB, dominated by history):

| Table | Rows | Size | Note |
|---|---|---|---|
| f1_race_odds_snapshots | 3.98 M | 708 MB | 3.67 M rows are older than 7 days |
| audit_log | 387 k | 191 MB | never pruned |
| apifootball_odds_raw | 2.4 k | 179 MB | raw provider JSON blobs kept forever |
| match_odds_snapshots | 189 k | 43 MB | |
| market_odds_snapshots | 220 k | 42 MB | |
| health_check_runs | 112 k | 27 MB | 5-min cron, never pruned |

Slowest queries by total time:

1. F1 snapshot batch inserts — 8,554 calls, 1.1 s average, 9,464 s total. Worst single consumer of IO on the whole instance.
2. Admin audit-log listing (`ORDER BY created_at DESC LIMIT/OFFSET`) — 436 calls, 3.4 s average. There are indexes on `(action, created_at)`, `(entity, entity_id)`, `(target_user_id, created_at)`, but none on `created_at` alone, so this sorts 387 k rows every time.
3. "Latest F1 snapshot" lookup filtering `market_id = ANY(...)` then sorting — 2,487 calls, 567 ms average. The index is per-market, so a 30-market `IN` list can't be served by one index scan.
4. Duplicate cron: `odds-live-poll-00/15/30/45` are all scheduled `* * * * *`. They were meant to be offset by 15 s but all four fire on the same second, so the heartbeat does 4x the work and 4 writers race on the same rows every minute.
5. `audit_log` inserts — 86 k calls — mostly high-volume, low-value automated events.

## Changes

### 1. Retention (biggest single win)
Add a scheduled prune job that deletes:
- `f1_race_odds_snapshots` older than 7 days (frees ~650 MB immediately)
- `match_odds_snapshots` / `market_odds_snapshots` / `sports_odds_snapshots` / `ufc_market_snapshots` older than 14 days
- `health_check_runs` older than 7 days
- `apifootball_odds_raw` older than 3 days (frees ~170 MB)
- `audit_log` older than 90 days

Deletes run in bounded batches so the prune itself doesn't spike IO, plus a one-time backfill prune of the existing backlog. Charts only ever read recent windows, so nothing user-visible changes.

### 2. Stop the F1 snapshot flood
- Only write a snapshot when the price actually changed, instead of every tick — a flat line is reconstructed from the last point on read.
- Cap the heartbeat to markets of the single next race rather than 5 races x 30 drivers.
- Widen heartbeat cadence for events more than 12 hours out.

Expected: F1 snapshot inserts drop by roughly 90%.

### 3. Fix the duplicate cron
Re-space `odds-live-poll-15/30/45` so the four jobs no longer collide on the same second (or collapse to a single job). This alone removes ~75% of the heartbeat query volume and the row-level contention behind the 7.9 s worst-case insert.

### 4. Indexes
- `audit_log (created_at DESC)` — fixes the 3.4 s admin listing.
- `market_odds_snapshots (match_id, snapshot_at DESC)` — currently `match_id` only, so history reads sort in memory.
- `f1_race_odds_snapshots (snapshot_at)` — makes the prune cheap.

### 5. Read-side trimming
- Replace the multi-market "latest snapshot" `IN` + sort with a per-market latest lookup so the existing index is used.
- The football matches list selects 16 columns of every match on each poll; narrow it to what the list renders and keep the existing filter.
- Reduce the 2 s live-chart refetch in the match analytics card to 5 s, and raise `staleTime` so tab-focus doesn't refetch immediately. Still comfortably "live" for a 15 s data cadence.

## Not doing yet

No instance upgrade. Retention alone takes the database from ~1.2 GB to well under 300 MB, and the write-volume fixes target the query responsible for the largest share of total execution time. After these land I'll re-check `db_health` and slow queries; if disk IO is still above ~60% under normal traffic, an upgrade recommendation follows with the numbers behind it.

## Technical notes

- Prune is a `SECURITY DEFINER` SQL function plus a `pg_cron` schedule, delivered as a migration; no table structure changes, no RLS or grant changes.
- Index creation is plain `CREATE INDEX` inside the migration.
- Heartbeat changes are confined to `src/lib/odds-live.server.ts`; read-path changes to `src/features/f1/f1.functions.ts`, `src/lib/matches.functions.ts`, and `src/components/matches/MarketAnalyticsCard.tsx`.
- No auth, accounting, or settlement code is touched.
