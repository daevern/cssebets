# Fill the market gaps: football cards/corners/specials + UFC method

Three tracks, in the order they deliver value.

## A. Map the missing football markets from the feed

Today the World Cup / `/matches/$matchId` mapper matches bookmaker markets by **exact bet-name string equality** (e.g. `name === "First Card"`). That is why `first_card`, `first_corner`, `red_card_match` and `draw_no_bet` are typed and settleable but have zero priced rows — the provider labels them slightly differently per bookmaker.

Work:
1. Diagnostic first: read the stored raw odds payloads (`apifootball_odds_raw`) and list the distinct bet ids + names the feed actually returns. That tells us the real labels rather than guessing.
2. Rewrite matching in the mapping layer to be resilient: match on **bet id** where known, else a normalised regex (lowercase, collapsed whitespace/punctuation) instead of exact equality. Same treatment for the value strings ("1"/"Home"/"Home Team", "No Card"/"Neither").
3. Keep the existing safety rails: minimum selection count per market, median across bookmakers, and provider-sourced only (never generated) for real matches.
4. Add unit tests with real captured payload fragments so the four markets stay mapped.

**Club football is a separate, bigger gap.** The club-football path (`sports_markets`) uses its own mapper, which has **no** cards, corners, correct-score or HT/FT specs at all — the UI already knows how to translate them, but nothing produces them. Adding them there also needs settlement rules and a fixture-statistics fetch (corners and cards are not derivable from the scoreline). Included below as an explicit sub-step so it isn't silently skipped.

Sub-steps for club football:
- Add mapper specs for total corners (8.5–11.5), team corners 4.5, total cards (2.5–5.5), team cards 1.5, red card, first card/corner, correct score and HT/FT.
- Add a fixture-statistics fetch to the API-Football adapter (corners, yellow/red cards per team) and persist those onto the result row.
- Extend the pure settlement decision function with rules for each new market, plus tests. Any market without a rule auto-voids, so no market ships without one.

## B. Cards and Corners as their own tabs

The shared match tab component **already has Cards and Corners tabs**, and they auto-enable when priced rows exist. So no new tab work is needed on the World Cup path once A lands — the tabs light up by themselves.

What we will do:
- Verify the tabs appear on a real fixture that has corner/card prices, at mobile width first.
- Make the tabs discoverable rather than silently absent: when a match has no card/corner prices yet, show a short "not priced for this fixture" state instead of hiding the tab entirely on matches where the competition normally carries them.
- Same tabs then work for club football automatically once A's club-football sub-step produces the rows.

## C. UFC method: suspend instead of disappear

Method, round and totals markets are written with `is_active: false`, and the fight page builds its tab list from active markets only — so those tabs vanish entirely and users see nothing.

Change:
- Return the inactive markets to the fight detail page with an explicit state flag rather than filtering them out.
- Render the Method / Round / Totals tabs with prices shown but greyed, carrying the existing "Suspended" badge and a one-line reason ("Not open for betting — winner market only").
- Bet placement stays blocked server-side exactly as today; this is a presentation change only, no loosening of the placement guard.

## Technical notes

- Files: `src/lib/apifootball-mapping.ts` (A1–A4), `src/features/football/adapters/marketMapper.ts` + `apiFootballAdapter.server.ts` + `services/decideWinningKeys.ts` + `services/footballSettlement.server.ts` (A club sub-step), `src/components/matches/MarketTabs.tsx` (B), `src/lib/ufc.functions.ts` + `src/routes/_authenticated/ufc.$fightId.tsx` (C).
- Settlement for corners/cards requires storing the fixture statistics; that means one added result column set via migration.
- No change to bet placement rules, liability caps, or the accounting journal.

## Suggested order

C (small, self-contained) → A World Cup mapping fix + B verification → A club-football markets and settlement.
