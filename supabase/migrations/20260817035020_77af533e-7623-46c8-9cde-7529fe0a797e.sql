DELETE FROM public.ufc_fight_markets m USING public.ufc_fights f, public.ufc_events e
  WHERE m.fight_id = f.id AND f.event_id = e.id AND e.event_key = 'oddsapi-2026-12-31';
DELETE FROM public.ufc_market_snapshots s USING public.ufc_fights f, public.ufc_events e
  WHERE s.fight_id = f.id AND f.event_id = e.id AND e.event_key = 'oddsapi-2026-12-31';
DELETE FROM public.ufc_fights f USING public.ufc_events e
  WHERE f.event_id = e.id AND e.event_key = 'oddsapi-2026-12-31';
DELETE FROM public.ufc_events WHERE event_key = 'oddsapi-2026-12-31';