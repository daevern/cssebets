
-- 1) Track who advanced on knockout ties (after ET + penalties)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS qualifier text
    CHECK (qualifier IN ('HOME','AWAY') OR qualifier IS NULL);

-- 2) Wire to_qualify into the per-user correlation groups
UPDATE public.platform_settings
   SET correlation_groups = jsonb_set(
         jsonb_set(
           COALESCE(correlation_groups, '{}'::jsonb),
           '{home_lean}',
           COALESCE(correlation_groups->'home_lean','[]'::jsonb)
             || jsonb_build_array('to_qualify:HOME'),
           true
         ),
         '{away_lean}',
         COALESCE(correlation_groups->'away_lean','[]'::jsonb)
           || jsonb_build_array('to_qualify:AWAY'),
         true
       )
 WHERE id = 1;

-- 3) Settlement: grade to_qualify by the qualifier
CREATE OR REPLACE FUNCTION public.settle_to_qualify_for_match(
  p_match_id uuid,
  p_qualifier text
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pred RECORD;
  v_count int := 0;
  v_won boolean;
  v_payout numeric;
  v_sim boolean;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id = p_match_id;
  v_sim := COALESCE(v_sim, false);

  FOR v_pred IN
    SELECT * FROM public.predictions
     WHERE match_id = p_match_id
       AND status = 'pending'::public.prediction_status
       AND market_text = 'to_qualify'
     FOR UPDATE
  LOOP
    -- Void if qualifier unknown (group-stage match or sync hasn't filled it)
    IF p_qualifier IS NULL OR p_qualifier NOT IN ('HOME','AWAY') THEN
      UPDATE public.predictions
         SET status='void', settled_at=now(),
             settled_result='void:no_qualifier'
       WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'refund'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Void: qualifier unavailable', v_sim);
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
        v_pred.id, p_match_id, 'Void to_qualify refund', v_sim);
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    v_won := v_pred.selection_label = p_qualifier;

    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions
         SET status='won', points=3, settled_at=now(),
             settled_result = 'qualifier:'||p_qualifier
       WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Win payout (to_qualify)', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout, v_pred.id, p_match_id,
        'Payout (to_qualify)', v_sim);
    ELSE
      UPDATE public.predictions
         SET status='lost', points=0, settled_at=now(),
             settled_result = 'qualifier:'||p_qualifier
       WHERE id = v_pred.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_to_qualify_for_match(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_to_qualify_for_match(uuid, text) TO service_role;

-- 4) Recreate settle_match_all_markets_atomic with optional qualifier param
DROP FUNCTION IF EXISTS public.settle_match_all_markets_atomic(uuid, int, int, int, int);

CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid,
  p_home int,
  p_away int,
  p_home_ht int DEFAULT NULL,
  p_away_ht int DEFAULT NULL,
  p_qualifier text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_a int := 0;
  v_b int := 0;
  v_c int := 0;
  v_locked boolean := false;
  v_has_pending boolean := false;
  v_stored_qualifier text;
BEGIN
  SELECT pg_try_advisory_xact_lock(hashtext('settle_match_all_markets_atomic'), hashtext(p_match_id::text))
    INTO v_locked;
  IF NOT v_locked THEN RETURN 0; END IF;

  -- Persist qualifier on the match when provided
  IF p_qualifier IN ('HOME','AWAY') THEN
    UPDATE public.matches SET qualifier = p_qualifier WHERE id = p_match_id;
  END IF;

  SELECT qualifier INTO v_stored_qualifier FROM public.matches WHERE id = p_match_id;

  SELECT EXISTS (
    SELECT 1 FROM public.predictions
    WHERE match_id = p_match_id AND status = 'pending'::public.prediction_status
  ) INTO v_has_pending;

  IF NOT v_has_pending THEN
    IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
      UPDATE public.matches
        SET home_score_ht = COALESCE(home_score_ht, p_home_ht),
            away_score_ht = COALESCE(away_score_ht, p_away_ht)
        WHERE id = p_match_id;
    END IF;
    RETURN 0;
  END IF;

  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    UPDATE public.matches
      SET home_score_ht = COALESCE(home_score_ht, p_home_ht),
          away_score_ht = COALESCE(away_score_ht, p_away_ht)
      WHERE id = p_match_id;
  END IF;

  SELECT public.settle_match_atomic(p_match_id, p_home, p_away) INTO v_a;
  SELECT public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht) INTO v_b;
  SELECT public.settle_to_qualify_for_match(p_match_id, COALESCE(p_qualifier, v_stored_qualifier)) INTO v_c;

  RETURN COALESCE(v_a,0) + COALESCE(v_b,0) + COALESCE(v_c,0);
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int, text) TO service_role;

-- 5) Allow to_qualify in place_market_bet_atomic
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market text, p_selection text,
  p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_odds numeric; v_pred_id uuid; v_potential numeric;
  v_settings public.platform_settings; v_caller text;
  v_match RECORD; v_sim boolean := false; v_existing uuid;
  v_snap_id uuid;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_market_bet_atomic is service-role only';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals','to_qualify') THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);
  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  IF v_odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);
  IF NOT v_sim THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market, p_selection, p_stake, v_odds);
    PERFORM public.assert_user_match_risk(p_user_id, p_match_id, p_market, p_selection, p_stake, v_odds);
  END IF;
  v_potential := ROUND(p_stake * v_odds, 2);
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
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
        WHEN 'to_qualify' THEN 'tournament_winner'::public.prediction_market
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

REVOKE ALL ON FUNCTION public.place_market_bet_atomic(uuid,uuid,text,text,numeric,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid,uuid,text,text,numeric,uuid) TO service_role;
