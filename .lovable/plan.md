## Problem
The user-side match page shows stored rows from `match_market_odds`. Disabling margin changes the match flag and regenerates derived odds, but API-Football-sourced rows are protected from being overwritten, so existing stored market odds can remain unchanged after refresh.

## Plan
1. **Update backend recalculation**
   - Modify the database function that runs when margin is disabled/enabled for a match.
   - Make it re-price all active `match_market_odds` rows for that match, including API-sourced rows, by stripping current overround and applying:
     - `1.0` overround when margin is disabled
     - the configured platform margin when margin is enabled

2. **Fix global margin-off behavior**
   - When `Risk Settings → Apply margin to real odds` is off, new odds syncs already write no-margin odds, but existing rows are not automatically rewritten.
   - Add an admin-safe server action that can re-price currently stored open-match odds after saving risk settings.
   - Call it after risk settings are saved so user-side pages show the no-margin prices without waiting for a fresh provider sync.

3. **Keep settlement unchanged**
   - Do not change settlement logic. Bets continue settling using the odds locked on the prediction row.

4. **Verification**
   - Confirm the margin-disabled match toggle changes stored odds in `match_market_odds`.
   - Confirm saving global margin-off refreshes currently open match odds.
   - Confirm `/matches/$matchId` reads the updated odds after refresh.