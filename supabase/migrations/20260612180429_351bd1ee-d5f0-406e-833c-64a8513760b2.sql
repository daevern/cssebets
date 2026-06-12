CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(p_user_id uuid, p_match_id uuid, p_market text, p_selection text, p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id uuid;
  v_existing uuid;
  v_odds numeric;
  v_potential numeric;
  v_match RECORD;
  v_sim boolean;
  v_settings public.platform_settings;
  v_snap_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals') THEN
    RAISE EXCEPTION 'unsupported market %', p_market;
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);

  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true
    LIMIT 1;
  IF v_odds IS NULL THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true
      LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'odds unavailable for selection'; END IF;

  v_potential := ROUND(p_stake * v_odds, 2);

  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_settings.max_potential_payout > 0 AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  INSERT INTO public.market_odds_snapshots(match_id, market, selection, odds, source)
    VALUES (p_match_id, p_market, p_selection, v_odds, 'internal')
    RETURNING id INTO v_snap_id;

  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(),
    'Bet placed ('||p_market||')', v_sim);

  BEGIN
    INSERT INTO public.predictions(
      user_id, match_id, market, outcome,
      reference_odds, reference_odds_snapshot_id, virtual_stake, potential_return,
      is_simulation, client_request_id, market_text, selection_label)
    VALUES (
      p_user_id, p_match_id,
      CASE p_market
        WHEN 'over_under_2_5' THEN 'total_goals'::public.prediction_market
        WHEN 'btts' THEN 'btts'::public.prediction_market
        WHEN 'correct_score' THEN 'correct_score'::public.prediction_market
        WHEN 'half_time_full_time' THEN 'first_scorer'::public.prediction_market
        WHEN 'exact_total_goals' THEN 'group_winner'::public.prediction_market
      END,
      p_market || ':' || p_selection,
      v_odds, NULL, p_stake, v_potential,
      v_sim, p_client_request_id, p_market, p_selection
    ) RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
  END;

  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id,
    'Stake collected ('||p_market||')', v_sim);

  RETURN v_pred_id;
END $function$;