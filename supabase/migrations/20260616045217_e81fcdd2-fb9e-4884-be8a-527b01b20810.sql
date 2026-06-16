
DROP FUNCTION IF EXISTS public.assert_betting_allowed(uuid, uuid, text, numeric, boolean);

CREATE OR REPLACE FUNCTION public.assert_betting_allowed(
  p_user_id uuid, p_match_id uuid, p_market text, p_odds numeric, p_is_simulation boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_s public.platform_settings;
  v_reason text;
  v_match_count int;
BEGIN
  SELECT * INTO v_s FROM public.platform_settings WHERE id = 1;
  IF v_s IS NULL THEN RETURN; END IF;
  IF v_s.bets_paused THEN RAISE EXCEPTION 'BETTING_PAUSED'; END IF;
  IF p_market = ANY(COALESCE(v_s.disabled_markets, '{}'::text[])) THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  IF v_s.correct_score_disabled AND p_market = 'correct_score' THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  IF v_s.high_odds_disabled AND p_odds IS NOT NULL AND p_odds >= v_s.high_odds_threshold THEN
    RAISE EXCEPTION 'HIGH_ODDS_DISABLED';
  END IF;
  IF NOT COALESCE(p_is_simulation, false) AND v_s.max_bets_per_user_per_match > 0 AND p_match_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_match_count
      FROM public.predictions
      WHERE user_id = p_user_id AND match_id = p_match_id
        AND status = 'pending'::public.prediction_status;
    IF v_match_count >= v_s.max_bets_per_user_per_match THEN
      RAISE EXCEPTION 'MAX_BETS_PER_MATCH';
    END IF;
  END IF;
  IF NOT COALESCE(p_is_simulation, false) AND p_match_id IS NOT NULL THEN
    v_reason := public.check_match_market_betting(p_match_id, p_market);
    IF v_reason <> 'OK' THEN RAISE EXCEPTION '%', v_reason; END IF;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_betting_allowed(uuid, uuid, text, numeric, boolean) TO service_role;
