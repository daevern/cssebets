-- Enforce one pending bet per (user, match, market, outcome) across BOTH bet paths.
-- The existing partial unique index only covered rows with market_text/selection_label
-- set, which excluded the result-market path (place_bet_atomic).

CREATE UNIQUE INDEX IF NOT EXISTS predictions_unique_pending_market_outcome
  ON public.predictions (user_id, match_id, market, outcome)
  WHERE status = 'pending'::public.prediction_status;

-- Extend assert_betting_allowed with an optional p_outcome so we surface a
-- friendly error before hitting the unique_violation at insert time.
DROP FUNCTION IF EXISTS public.assert_betting_allowed(uuid, uuid, text, numeric, boolean);

CREATE OR REPLACE FUNCTION public.assert_betting_allowed(
  p_user_id uuid,
  p_match_id uuid,
  p_market text,
  p_odds numeric,
  p_is_simulation boolean DEFAULT false,
  p_outcome text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_s public.platform_settings;
  v_reason text;
  v_match_count int;
  v_dupe int;
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

  -- One pending bet per (user, match, market, outcome). Applies to real bets only.
  IF NOT COALESCE(p_is_simulation, false)
     AND p_match_id IS NOT NULL
     AND p_outcome IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dupe
      FROM public.predictions
      WHERE user_id = p_user_id
        AND match_id = p_match_id
        AND market  = p_market::public.prediction_market
        AND outcome = p_outcome
        AND status  = 'pending'::public.prediction_status;
    IF v_dupe > 0 THEN
      RAISE EXCEPTION 'DUPLICATE_SELECTION';
    END IF;
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

REVOKE ALL ON FUNCTION public.assert_betting_allowed(uuid, uuid, text, numeric, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_betting_allowed(uuid, uuid, text, numeric, boolean, text) TO service_role;

-- Update place_bet_atomic (result-market path) to pass the outcome through.
CREATE OR REPLACE FUNCTION public.place_bet_atomic(p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid, p_cap_pct numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1; v_existing UUID;
  v_settings public.platform_settings; v_cap_pct NUMERIC; v_caller text;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_bet_atomic is service-role only';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  v_potential := ROUND(p_stake * p_odds, 2);
  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status,is_simulation INTO v_match
      FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
    v_row_id := CASE WHEN v_sim THEN 2 ELSE 1 END;
  END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market::text, p_odds, v_sim, p_outcome);
  IF NOT v_sim AND p_match_id IS NOT NULL THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market::text, p_outcome, p_stake, p_odds);
    PERFORM public.assert_user_match_risk(p_user_id, p_match_id, p_market::text, p_outcome, p_stake, p_odds);
  END IF;
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;
  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  v_cap_pct := COALESCE(p_cap_pct, v_settings.exposure_cap_pct, 1.0);
  IF v_cap_pct <= 0 OR v_cap_pct > 1 THEN v_cap_pct := 1.0; END IF;
  IF NOT v_sim AND p_match_id IS NOT NULL
     AND p_market = 'result'::public.prediction_market
     AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h,v_d,v_a
      FROM public.predictions
     WHERE match_id=p_match_id AND market='result'::public.prediction_market
       AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h, v_d, v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id AND is_simulation = false;
    IF (v_bankroll * v_cap_pct) < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type,p_stake,
    'bet_placement'::public.wallet_ref_type,gen_random_uuid(),'Bet placed (stake_debit)', v_sim);
  BEGIN
    INSERT INTO public.predictions(
      user_id,match_id,market,outcome,reference_odds,
      reference_odds_snapshot_id,virtual_stake,potential_return,is_simulation,client_request_id)
     VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential,v_sim,p_client_request_id)
     RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_SELECTION';
  END;
  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  ELSE
    PERFORM public.platform_apply_change(
      'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, NULL,
      'Stake collected (no-match bet)', v_sim);
  END IF;
  RETURN v_pred_id;
END $function$;

REVOKE ALL ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid) TO service_role;

-- Update place_market_bet_atomic to pass the selection through to the assert.
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(p_user_id uuid, p_match_id uuid, p_market text, p_selection text, p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_caller text;
  v_settings public.platform_settings;
  v_match record;
  v_sim boolean := false;
  v_odds_row record;
  v_odds numeric;
  v_potential numeric;
  v_existing uuid;
  v_pred_id uuid;
  v_market_enum public.prediction_market;
  v_snapshot_id uuid;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_market_bet_atomic is service-role only';
  END IF;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_match_id IS NULL THEN RAISE EXCEPTION 'match required'; END IF;
  IF p_market IS NULL OR length(trim(p_market)) = 0 THEN RAISE EXCEPTION 'market required'; END IF;
  IF p_selection IS NULL OR length(trim(p_selection)) = 0 THEN RAISE EXCEPTION 'selection required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;

  IF p_market NOT IN (
    'over_under_0_5','over_under_1_5','over_under_2_5','over_under_3_5','over_under_4_5','over_under_5_5','over_under_6_5',
    'btts','correct_score','half_time_full_time','exact_total_goals','to_qualify',
    'double_chance','draw_no_bet','goals_odd_even',
    'clean_sheet_home','clean_sheet_away','win_to_nil_home','win_to_nil_away',
    'cards_over_under_2_5','cards_over_under_3_5','cards_over_under_4_5','cards_over_under_5_5',
    'home_cards_over_under_1_5','away_cards_over_under_1_5',
    'red_card_match','first_card',
    'corners_over_under_8_5','corners_over_under_9_5','corners_over_under_10_5','corners_over_under_11_5',
    'home_corners_over_under_4_5','away_corners_over_under_4_5',
    'first_corner'
  ) THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing
      FROM public.predictions
     WHERE user_id = p_user_id
       AND client_request_id = p_client_request_id
     LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);

  SELECT odds, source, generated INTO v_odds_row
    FROM public.match_market_odds
   WHERE match_id = p_match_id
     AND market = p_market
     AND selection = p_selection
     AND active = true
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_odds_row.odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds, source, generated INTO v_odds_row
      FROM public.match_market_odds
     WHERE match_id = p_match_id
       AND market = p_market
       AND selection = p_selection
       AND active = true
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_odds_row.odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  IF NOT v_sim AND (COALESCE(v_odds_row.generated, true) = true OR v_odds_row.source IS DISTINCT FROM 'api-football') THEN
    RAISE EXCEPTION 'ODDS_NOT_TRUSTED';
  END IF;

  v_odds := v_odds_row.odds;
  IF v_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;

  v_market_enum := p_market::public.prediction_market;
  v_potential := ROUND(p_stake * v_odds, 2);
  v_snapshot_id := NULL;

  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim, p_selection);
  IF NOT v_sim THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market, p_selection, p_stake, v_odds);
    PERFORM public.assert_user_match_risk(p_user_id, p_match_id, p_market, p_selection, p_stake, v_odds);
  END IF;

  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  PERFORM public.wallet_apply_change(
    p_user_id,
    'debit'::public.wallet_txn_type,
    p_stake,
    'bet_placement'::public.wallet_ref_type,
    gen_random_uuid(),
    'Bet placed (stake_debit)',
    v_sim
  );

  BEGIN
    INSERT INTO public.predictions(
      user_id, match_id, market, outcome, reference_odds,
      reference_odds_snapshot_id, virtual_stake, potential_return,
      is_simulation, client_request_id, market_text, selection_label, market_label
    ) VALUES (
      p_user_id, p_match_id, v_market_enum, p_selection, v_odds,
      v_snapshot_id, p_stake, v_potential, v_sim, p_client_request_id,
      p_market, p_selection, p_market
    )
    RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_SELECTION';
  END;

  PERFORM public.pool_apply_change(
    p_match_id,
    p_selection,
    p_stake,
    'stake_held',
    v_pred_id,
    p_user_id,
    'Stake held in match pool'
  );
  PERFORM public.recalc_match_liabilities(p_match_id);

  RETURN v_pred_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) TO service_role;
