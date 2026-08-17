ALTER TABLE public.ufc_fights
  ADD CONSTRAINT ufc_fights_odds_api_event_id_key UNIQUE (odds_api_event_id);