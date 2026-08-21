# Get the extra markets actually showing for users (UFC + Football)

The market code was added, but the data behind it never reaches the pages. The UI is fine — the feeds are only writing the basic markets.

## What I verified

- UFC: of 44 upcoming fights, only 2 have an API-Sports MMA id. The upcoming fights are created by The Odds API sync, which requests only the moneyline market. Method / Round / Total Rounds rows exist only for fights that already finished (last ones on 16 Aug), so the fight page shows a single tab.
- Football: 33 upcoming fixtures each have the same 27 markets (result, goals lines, BTTS, halves, clean sheets, odd/even). None have Correct Score, HT/FT, Corners or Cards, even though the odds sync ran minutes ago and the mapper rules for those exist. So the provider payload isn't being matched into those markets.
- F1 markets (podium, top 5, points, fastest lap, constructor, H2H) are already priced — no change planned there unless the check below shows gaps.

## Plan

1. Inspect one live API-Football odds payload for an upcoming fixture and list the exact bet names/ids the bookmakers return. Fix the mapper so Correct Score, HT/FT, Corners (total/home/away) and Cards (total/home/away, red card) actually match those names and lines, instead of the patterns we guessed. Confirm rows land in the database and the tabs appear on a match page.
2. For UFC, link upcoming fights to the richer MMA feed so Method / Round / Total Rounds get priced for them:
   - match Odds API bouts to API-Sports MMA fights by fighter names + date and store the id, then run the existing rich odds builder for those fights;
   - where no MMA match exists, derive Method / Round / Total Rounds from the moneyline the way the builder already does for missing feed data, so every upcoming fight shows more than one tab.
3. Re-check the fight and match pages in a browser to confirm the extra tabs render, prices look sane, and bets can be placed.
4. Confirm settlement paths already cover the newly surfaced markets (they were wired earlier) and that anything ungradable voids rather than hangs.

## Technical notes

- Football mapping lives in `src/features/football/adapters/marketMapper.ts`, writing via `syncFootballOddsForEvent` in `src/features/football/services/footballSync.server.ts`.
- UFC discovery/odds: `src/lib/ufc-oddsapi.server.ts` (Odds API, h2h only) vs `src/lib/ufc-odds.server.ts` (rich builder keyed on `apimma_fight_id`).
- No schema changes expected; markets are keyed on existing tables.
