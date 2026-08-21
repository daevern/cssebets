# Real provider odds for UFC and F1

## What I verified just now (live calls with your key)

All three subscriptions are active on **Pro**, 7,500 requests/day:

- Football — Pro, active. Odds catalogue returns 338 bet types.
- MMA — Pro, active. Odds endpoint works and returns real bookmaker prices (bet365, Pinnacle, Betfair, Unibet, BetVictor, Marathon, Sbo...) for the upcoming card: Home/Away (moneyline), 3-Way Result, Over/Under rounds, Asian Handicap. Fixtures are listed roughly 4 weeks ahead.
- Formula-1 — Pro, active. **There is no odds product for Formula-1 at API-Sports.** `/odds`, `/odds/bets`, `/bets`, `/odds/bookmakers` all reply `"This endpoint do not exist."` — this is not a plan restriction, the endpoints don't exist in the F1 API at all. The Odds API also does not carry Formula 1.

So UFC can be made 100% real. F1 cannot be, with any feed currently purchased.

## What gets built

### 1. UFC — real odds only

- Make API-Sports MMA the primary source: discover cards from `/fights` by date across the next ~30 days, link each bout to its fighters, and price it from `/odds`.
- Ingest every market the bookmakers actually offer, not just the winner: moneyline, method of victory (KO/TKO, submission, decision, unanimous vs split), round betting, over/under rounds, fight to go the distance, and handicap where present. The mapping code for these already exists and is used for in-window cards — it becomes the main path.
- Keep The Odds API as the fallback for cards further out than the MMA feed prices (it is also real bookmaker data), and let real API-Sports prices overwrite it as soon as they appear.
- **Delete the synthetic market generator** (`ufc-derived-markets.server.ts`) and its call site, plus remove any rows it previously wrote so no modelled Method/Round prices remain in the database.
- A market only exists when a provider prices it. Fights that only have a winner market show only the Winner tab — no invented tabs.
- Record the source (bookmaker consensus + provider) per market so the admin console and the fight page can show where a price came from.

### 2. Odds provenance and margin stay unchanged

Provider prices keep going through the existing overround-strip + CSSEBets house margin, exactly like football. That is pricing on top of real odds, not invented odds.

### 3. F1 — remove the house-modelled prices

Recommended: keep the F1 product (races, drivers, constructors, standings, live race state, results) and **suspend F1 betting markets** until a real F1 odds feed exists. Concretely:

- Turn off the softmax odds builder so no modelled prices are written.
- Existing open F1 bets are left alone and settle normally; no new F1 markets are offered.
- The F1 pages show a clear "markets unavailable" state instead of empty/blank tabs.
- Admin flag to re-enable instantly the day a real F1 odds source is wired.

If you would rather keep F1 betting live, the alternative is to keep the model and label every F1 price in the UI as a CSSEBets house price rather than bookmaker odds. Tell me which you want; the plan otherwise assumes suspension.

### 4. Verification

- Run the UFC sync against the live feed and confirm the 22–23 Aug card writes real moneyline, totals and handicap rows with prices traceable to bet365/Pinnacle.
- Query the database for any remaining market rows with no provider source and clear them.
- Check the fight detail page renders only provider-backed tabs.

## Technical notes

- `src/lib/ufc-odds.server.ts` — becomes the primary sync: date-window discovery from `/fights`, `/odds` per fight, existing bet-id mapping (2 = Home/Away, 1 = 3-Way, 4 = Over/Under, 6 = Round Betting, 11–22 = method variants).
- `src/lib/ufc-oddsapi.server.ts` — drops the `deriveUfcSecondaryMarkets` call; stays as the out-of-window moneyline fallback.
- `src/lib/ufc-derived-markets.server.ts` — deleted.
- `src/features/f1/services/f1OddsBuilder.server.ts` / `f1Sync.server.ts` — odds writing gated off behind a feature flag; race/driver/constructor/results sync untouched.
- Migration: clear modelled UFC method/round rows and their snapshots; deactivate F1 market rows if suspension is approved.
- Cron cadence for `ufc-odds` stays as is; MMA quota is 7,500/day and the sync stays well inside it.
