CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid,
  p_match_id uuid,
  p_market text,
  p_selection text,
  p_stake numeric,
  p_client_request_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_settings public.platform_settings;
  v_match record;
  v_sim boolean := false;
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

  SELECT odds INTO v_odds
    FROM public.match_market_odds
   WHERE match_id = p_match_id
     AND market = p_market
     AND selection = p_selection
     AND active = true
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds
      FROM public.match_market_odds
     WHERE match_id = p_match_id
       AND market = p_market
       AND selection = p_selection
       AND active = true
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  IF v_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;

  v_market_enum := p_market::public.prediction_market;
  v_potential := ROUND(p_stake * v_odds, 2);

  SELECT id INTO v_snapshot_id
    FROM public.market_odds_snapshots
   WHERE match_id = p_match_id
     AND market = p_market
     AND selection = p_selection
   ORDER BY sampled_at DESC NULLS LAST
   LIMIT 1;

  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);
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
      user_id,
      match_id,
      market,
      outcome,
      reference_odds,
      reference_odds_snapshot_id,
      virtual_stake,
      potential_return,
      is_simulation,
      client_request_id,
      market_text,
      selection_label,
      market_label
    ) VALUES (
      p_user_id,
      p_match_id,
      v_market_enum,
      p_selection,
      v_odds,
      v_snapshot_id,
      p_stake,
      v_potential,
      v_sim,
      p_client_request_id,
      p_market,
      p_selection,
      p_market
    )
    RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
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
$function$;

REVOKE EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) TO service_role;