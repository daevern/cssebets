# Demo bets in the database + "stuck pending" bets

## What I found (verified against the live database)

**1. Yes — demo (guest) bets are stored server-side.**
Anonymous demo sessions get a real account, profile and wallet row, and their bets are written to
the same tables as real bets (`predictions`, `sports_bets`, `f1_bets`, `ufc_bets`), just booked in
the SIMULATION environment so they never touch the real bankroll or P/L. The UI hides them after a
refresh and the hourly purge job deletes guest accounts idle for 48h (which cascades their bets).
So they are stored, temporarily, by design — the demo games are server-authoritative, which is why
a row has to exist.

**2. Right now there are zero pending bets anywhere.**
- `predictions`: 429 lost, 158 won, 65 void — **0 pending**
- `sports_bets`: 1 row, lost — **0 pending**
- `f1_bets` / `ufc_bets`: all won/lost/void — **0 pending**
- `sports_events`: all 6 finished events have **0 unsettled markets**; every remaining unsettled
  market belongs to a scheduled (not yet played) event.

So nothing is currently stuck. The pending rows you saw were almost certainly guest demo bets that
have since been purged, or a stale admin/browser cache. I have not been able to reproduce a real
stuck bet, so the cause is unconfirmed.

## Proposed work

### 1. Confirm before fixing
Add a small, permanent check instead of guessing: a "stuck settlements" panel in the admin
operations page that lists any bet still `pending`/`open` whose match/event/race/fight is already
`finished`, across all four bet tables (today it only proxies two of them). Zero rows today =
proof the pipeline is healthy; non-zero later = the exact rows to fix, with age and sport.

### 2. Separate demo from real everywhere in admin
Bets and stake/exposure numbers in the admin dashboard currently mix guest simulation bets with
real ones. Add a "Demo" filter/toggle so counts, pending stake and exposure default to real
members only (matching the user list, which already excludes guests).

### 3. Make stale demo rows self-clearing sooner
Guest bets already disappear with the 48h purge. Optionally shorten this for bets specifically:
mark guest bets from expired demo sessions as `void` on purge rather than relying on cascade
delete, so nothing can linger as "pending" in reports.

## Technical notes
- Stuck-bet query joins: `predictions → matches`, `sports_bets → sports_markets → sports_events`,
  `f1_bets → f1_races`, `ufc_bets → ufc_fights`, filtering `status in ('pending','open')` and the
  parent in a finished state. Surfaces in `src/lib/operations.functions.ts` and the operations
  route UI.
- Guest exclusion reuses the existing `auth_provider <> 'anonymous'` predicate already applied in
  `admin-dashboard.functions.ts` and `management.functions.ts`.
- No settlement-logic changes proposed until the panel shows a real stuck row.
