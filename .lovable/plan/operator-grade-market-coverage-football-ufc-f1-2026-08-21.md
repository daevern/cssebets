# Operator-grade market coverage: Football, UFC, F1

World Cup is done and stays frozen — no work there. The goal is that club football, UFC and F1 each carry the market depth a major sportsbook offers, fully priced from the paid feeds and fully settleable.

## 1. Club football — the big gap

The club-football odds mapper currently covers: match result, double chance, draw no bet, total goals, BTTS, odd/even, exact goals, winning margin, half markets (1H/2H result and goals), highest scoring half, and team goals. It has **no** cards, corners, correct score or HT/FT specs, so those never reach the UI even though API-Football prices them.

Add, in the mapper:
- Correct score, and Half-Time / Full-Time
- Total corners (8.5–11.5), team corners over/under, first corner
- Total cards (2.5–5.5), team cards, red card in match, first team carded
- Clean sheet home/away, win to nil, both-teams-to-score combos with result
- Anytime / first goalscorer if the plan's feed tier returns it (verified during build; skipped cleanly if not)

Each new market also needs:
- **Settlement rules** in the pure decision function, with unit tests. Anything without a rule auto-voids today, so no market ships without one.
- **Match statistics ingestion**: corners and cards are not derivable from the scoreline. Add a fixture-statistics fetch to the API-Football adapter and persist corners + yellow/red counts per team on the result row (one migration).
- Correct-score and scorer markets get their own liability caps, consistent with the existing risk controls.

The shared match page already has Cards and Corners tabs that light up when priced rows exist, so the UI follows automatically; we verify at mobile width and add a short "not priced for this fixture" state instead of a silently missing tab.

## 2. UFC — open up the markets we already price

Method, Round and Total Rounds odds are already written to the database but flagged inactive, and the fight page builds its tab list from active markets only, so those tabs vanish entirely.

- Turn Method of Victory (KO/TKO, submission, decision, per fighter), Round betting, Total Rounds over/under, Go the Distance and Fight Winner into live, bettable markets.
- Requires settlement inputs: capture finish method, finishing round and whether the fight went the distance from the results feed, and extend UFC settlement to resolve each market.
- Any market without a confirmed settlement source stays visible but explicitly **Suspended** with a reason, rather than disappearing.

## 3. F1 — audit then extend

Audit what the F1 odds builder currently produces, then bring it up to standard operator coverage:
- Race winner, podium finish, top 6 / points finish
- Winning constructor, fastest lap
- Head-to-head driver matchups, first retirement / classified finish
- Qualifying: pole position
- Championship outrights (already present — verified during the audit)

Same rule: every market added gets a settlement rule fed by the F1 results feed, or it is not offered.

## Cross-cutting

- Feed-name matching becomes tolerant: match on bookmaker bet id where known, else a normalised regex, so a bookmaker labelling a market slightly differently no longer silently drops it.
- Provider-sourced only for real fixtures — no generated or derived prices, as today.
- A short admin view listing, per sport, which markets are priced vs. missing, so gaps are visible instead of guessed at.
- Existing risk controls (liability caps, max payout, stake limits) apply unchanged to every new market.

## Technical notes

Files: `src/features/football/adapters/marketMapper.ts`, `apiFootballAdapter.server.ts`, `services/decideWinningKeys.ts` + tests, `services/footballSettlement.server.ts`; `src/lib/ufc-odds.server.ts`, `src/lib/ufc.functions.ts`, `src/routes/_authenticated/ufc.$fightId.tsx`; `src/features/f1/services/f1OddsBuilder.server.ts` and `f1Settlement.server.ts`. One migration for match-statistics columns and UFC finish-detail columns. No changes to the accounting journal or bankroll logic.

## Suggested order

Football cards/corners/correct-score (largest user-visible gain) → UFC method/round/totals → F1 audit and extension.
