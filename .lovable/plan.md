## What I verified

- Belgium GP is marked `finished`, but `settled_at` is still empty and its F1 bet is still open/pending.
- Belgium has no saved result payload yet, so the settlement job has not successfully written race results and graded markets.
- Hungary GP is scheduled for `2026-07-26` in the database, so those two Hungary bets should remain pending until that race has actually finished.
- The F1 settlement cron exists, but I’ll make the settlement path more robust and add a one-time repair for the already-finished Belgium race.

## Plan

1. **Harden the F1 settlement job**
   - Update `settleF1RaceById` to select `settled_at` properly.
   - Treat already-started/finished races with open bets as settlement candidates until `settled_at` is present.
   - Save the fetched result rows on the race before grading, so admins can see why a market settled.

2. **Make top-5 settlement resilient**
   - Grade `top_5_finish` from final race rankings by normalized driver name.
   - Keep fastest lap / constructor specials from blocking normal top-5 settlement if their provider data is delayed.

3. **Run/repair Belgium GP settlement**
   - Trigger the F1 settlement after the code change.
   - If API-F1 still returns no final rankings for Belgium, inspect the live/result payload and use the provider’s available standings endpoint fallback so Belgium top-5 markets can be graded.

4. **Confirm wallet/picks/admin state**
   - Verify the Belgium bet changes from pending to won/lost.
   - Verify the matching market has `winning` set and `settled_at` filled.
   - Verify winning payouts create wallet transactions only once.

5. **Leave Hungary pending**
   - Do not manually settle Hungary now because the stored race date is still upcoming.
   - If that date is wrong from API-F1, I’ll correct the race sync date source in a follow-up after verifying the provider row for Hungary.