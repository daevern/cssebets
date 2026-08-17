CREATE TEMP TABLE _sports_market_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id AS duplicate_id,
    first_value(id) OVER (
      PARTITION BY sports_event_id, market_key, period, line
      ORDER BY last_odds_update_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY sports_event_id, market_key, period, line
      ORDER BY last_odds_update_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC, id
    ) AS row_rank
  FROM public.sports_markets
)
SELECT duplicate_id, keeper_id
FROM ranked
WHERE row_rank > 1;

CREATE TEMP TABLE _sports_selection_merge ON COMMIT DROP AS
SELECT
  duplicate_selection.id AS duplicate_id,
  keeper_selection.id AS keeper_id
FROM _sports_market_merge market_merge
JOIN public.sports_market_selections duplicate_selection
  ON duplicate_selection.sports_market_id = market_merge.duplicate_id
JOIN public.sports_market_selections keeper_selection
  ON keeper_selection.sports_market_id = market_merge.keeper_id
 AND keeper_selection.selection_key = duplicate_selection.selection_key;

UPDATE public.sports_bets bet
SET sports_selection_id = selection_merge.keeper_id
FROM _sports_selection_merge selection_merge
WHERE bet.sports_selection_id = selection_merge.duplicate_id;

UPDATE public.sports_bets bet
SET sports_market_id = market_merge.keeper_id
FROM _sports_market_merge market_merge
WHERE bet.sports_market_id = market_merge.duplicate_id;

UPDATE public.sports_settlement_items item
SET sports_market_id = market_merge.keeper_id
FROM _sports_market_merge market_merge
WHERE item.sports_market_id = market_merge.duplicate_id;

DELETE FROM public.sports_market_selections selection
USING _sports_selection_merge selection_merge
WHERE selection.id = selection_merge.duplicate_id;

UPDATE public.sports_market_selections selection
SET sports_market_id = market_merge.keeper_id
FROM _sports_market_merge market_merge
WHERE selection.sports_market_id = market_merge.duplicate_id;

DELETE FROM public.sports_odds_snapshots snapshot
USING (
  SELECT snapshot_id
  FROM (
    SELECT
      odds.id AS snapshot_id,
      row_number() OVER (
        PARTITION BY
          coalesce(market_merge.keeper_id, odds.sports_market_id),
          odds.selection_key,
          odds.provider_ts,
          odds.decimal_odds
        ORDER BY odds.fetched_at DESC, odds.id DESC
      ) AS duplicate_rank
    FROM public.sports_odds_snapshots odds
    LEFT JOIN _sports_market_merge market_merge
      ON market_merge.duplicate_id = odds.sports_market_id
  ) ranked_snapshots
  WHERE duplicate_rank > 1
) duplicate_snapshots
WHERE snapshot.id = duplicate_snapshots.snapshot_id;

UPDATE public.sports_odds_snapshots snapshot
SET sports_market_id = market_merge.keeper_id
FROM _sports_market_merge market_merge
WHERE snapshot.sports_market_id = market_merge.duplicate_id;

DELETE FROM public.sports_markets market
USING _sports_market_merge market_merge
WHERE market.id = market_merge.duplicate_id;

ALTER TABLE public.sports_markets
  DROP CONSTRAINT sports_markets_sports_event_id_market_key_period_line_key;

ALTER TABLE public.sports_markets
  ADD CONSTRAINT sports_markets_event_market_period_line_unique
  UNIQUE NULLS NOT DISTINCT (sports_event_id, market_key, period, line);