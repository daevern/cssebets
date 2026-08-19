CREATE OR REPLACE FUNCTION public.skip_noop_odds_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  k text;
BEGIN
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOREACH k IN ARRAY ARRAY['updated_at','last_odds_update_at','provider_odds_ts','odds_updated_at','sampled_at','snapshot_at','fetched_at','last_seen_at','synced_at']
  LOOP
    v_old := v_old - k;
    v_new := v_new - k;
  END LOOP;
  IF v_old = v_new THEN
    RETURN NULL; -- identical payload: skip the write entirely
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skip_noop_match_market_odds ON public.match_market_odds;
CREATE TRIGGER trg_skip_noop_match_market_odds
  BEFORE UPDATE ON public.match_market_odds
  FOR EACH ROW EXECUTE FUNCTION public.skip_noop_odds_update();

DROP TRIGGER IF EXISTS trg_skip_noop_sports_market_selections ON public.sports_market_selections;
CREATE TRIGGER trg_skip_noop_sports_market_selections
  BEFORE UPDATE ON public.sports_market_selections
  FOR EACH ROW EXECUTE FUNCTION public.skip_noop_odds_update();

DROP TRIGGER IF EXISTS trg_skip_noop_f1_race_markets ON public.f1_race_markets;
CREATE TRIGGER trg_skip_noop_f1_race_markets
  BEFORE UPDATE ON public.f1_race_markets
  FOR EACH ROW EXECUTE FUNCTION public.skip_noop_odds_update();

DROP TRIGGER IF EXISTS trg_skip_noop_ufc_fight_markets ON public.ufc_fight_markets;
CREATE TRIGGER trg_skip_noop_ufc_fight_markets
  BEFORE UPDATE ON public.ufc_fight_markets
  FOR EACH ROW EXECUTE FUNCTION public.skip_noop_odds_update();