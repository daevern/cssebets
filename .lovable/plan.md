
## 1. Expand markets pulled from API-Sports MMA

In `src/lib/apimma.server.ts` + `src/lib/ufc-odds.server.ts`, capture and persist every market the API actually returns for the fight. New `market_type` values added to `ufc_fight_markets`:

- `total_rounds` — Over/Under lines 1.5 / 2.5 / 3.5 / 4.5. Selection keys `over_1_5`, `under_1_5`, ... One row per line/side, aggregated across all bookmakers (median).
- `distance` — "Fight goes the distance" Yes/No. Selection keys `yes`, `no`. Currently only "Yes" is kept (as `round=distance`); "No" is dropped.
- `method` — keep existing per-fighter buckets, plus add a name-based capture pass for bookmakers that expose "Fighter X to win by KO/Sub/Dec" under non-standard bet ids.
- `method_round` — combo "Fighter X in Round N" when the API exposes it (bet name matches `/method.*round|round.*method/`). Selection keys `a_r1`, `a_r2`, `b_r1`, etc.
- `round_group` — grouped-round markets ("Rounds 1-3 / 4-5"). Selection keys `a_early`, `a_late`, `b_early`, `b_late`.
- `round` — keep existing (explicit + derived-from-OU fallback).

All new markets are aggregated across bookmakers with median pricing and platform margin applied via `applyOutrightMargin`. Every write also inserts into `ufc_market_snapshots` so the movement graph continues to have history.

New `market_type` values are added to whatever CHECK constraint / enum currently gates `ufc_fight_markets`; migration is included if needed.

## 2. Surface the new markets in the fight detail UI

In `src/routes/_authenticated/ufc.$fightId.tsx`:

- Extend the tab bar in `MarketsBoard` to include tabs for **Total Rounds**, **Distance**, and (when present) **Round Group** and **Method + Round**. Each tab still uses the same segmented pill style as the football `MarketTabs` for 1:1 consistency.
- Empty tabs auto-hide (same filter pattern already used).
- Bet slip / `placeUfcBet` payload already carries free-form `market_type` + `selection_key`, so no server-fn signature changes; settlement RPC gets updated to recognise the new keys (settle-as-void if we don't have a resolver yet — I'll wire `total_rounds` and `distance` resolvers since they're computable from the finish round; other new ones start as `is_active=true` display-only until the resolver lands, but I'll flag them so you can decide whether to enable betting).

## 3. Market movement chart — moneyline only

In `MarketMovementSection`, hard-restrict `availableTypes` to `["moneyline"]`. Remove the tab bar entirely when only one type is shown so it renders like the football chart with a single title. Keep the endpoint label / dashed grid / no-Y-axis styling untouched.

## 4. Fix Tale of the Tape

In `src/lib/apimma.server.ts` add `searchFighter(name)` that hits `/fighters?search=<lastname>` and returns the best match.

In `src/lib/ufc-odds.server.ts` `upsertFighter`:

1. Read the existing row **before** building the payload.
2. If `/fighters?id=` returns nothing, try `searchFighter(name)` as fallback.
3. Build the payload with `??` coalescing so a missing field on this fetch never overwrites a previously-good value (`record_w: detail?.record?.wins ?? existing?.record_w ?? null`, same pattern for every field).
4. Add a lightweight retry (one immediate re-fetch) when `/fighters` throws — the paid plan rate-limits are per-second, not per-day.

In `src/routes/_authenticated/ufc.$fightId.tsx` `TaleOfTape`:

- Compute `age` client-side from `dob` (`Math.floor((now - dob) / yearMs)`) and render it in the age row instead of the current placeholder.
- Render `country` with the flag emoji helper already in `src/lib/country-flags.ts`.
- Show "—" only when the specific field is truly null after the coalescing fix.

## 5. One-time backfill

After deploy, trigger the existing **Admin → UFC → Sync now** button once so the paid-plan `/fighters` calls populate the record/reach/height/stance/country for the current card and the new markets are written. Movement history begins accumulating on the next 30s cron tick.

## Technical notes

- No changes to the football side.
- `ufc_market_snapshots` schema already supports arbitrary `market_type` + `selection_key`, no migration needed there.
- `ufc_fight_markets` may have a CHECK constraint on `market_type`; migration will `DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (market_type IN (...))` with the expanded list.
- Settlement: `total_rounds` and `distance` are trivially resolvable from `finish_round` / `went_to_decision` on `ufc_fights`. `method_round` and `round_group` need resolver work — I'll add TODOs and keep them display-only until you confirm you want betting enabled on them.
