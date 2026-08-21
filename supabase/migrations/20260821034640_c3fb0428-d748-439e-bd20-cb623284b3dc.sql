-- The skip_noop_odds_update trigger cancels UPDATEs that don't change odds, so
-- purge legacy non-bookmaker rows by deleting them outright.
DELETE FROM public.ufc_market_snapshots s
USING public.ufc_fight_markets m
WHERE s.fight_id = m.fight_id
  AND s.market_type = m.market_type
  AND s.selection_key = m.selection_key
  AND m.odds_source IS NULL;

DELETE FROM public.ufc_fight_markets WHERE odds_source IS NULL;