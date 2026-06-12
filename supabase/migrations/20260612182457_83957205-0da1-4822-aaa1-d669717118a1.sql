
-- Edit stake on a pending bet (only while match is still scheduled & before kickoff)
CREATE OR REPLACE FUNCTION public.edit_pending_bet_stake(
  p_user_id uuid,
  p_prediction_id uuid,
  p_new_stake numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pred public.predictions%ROWTYPE;
  v_match RECORD;
  v_settings public.platform_settings;
  v_diff numeric;
  v_new_potential numeric;
  v_sim boolean;
  v_is_market_bet boolean;
BEGIN
  IF p_user_id IS NULL OR p_prediction_id IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  IF p_new_stake IS NULL OR p_new_stake < 10 OR p_new_stake > 50000 THEN
    RAISE EXCEPTION 'INVALID_STAKE: stake must be between 10 and 50000';
  END IF;

  SELECT * INTO v_pred FROM public.predictions WHERE id = p_prediction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_pred.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_pred.status <> 'pending'::public.prediction_status THEN
    RAISE EXCEPTION 'BET_NOT_PENDING';
  END IF;

  IF v_pred.match_id IS NOT NULL THEN
    SELECT id, kickoff_at, status, is_simulation INTO v_match
      FROM public.matches WHERE id = v_pred.match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
  ELSE
    v_sim := COALESCE(v_pred.is_simulation, false);
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  v_new_potential := ROUND(p_new_stake * v_pred.reference_odds, 2);
  IF NOT v_sim AND v_settings.max_potential_payout > 0 AND v_new_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  v_diff := p_new_stake - v_pred.virtual_stake;
  IF v_diff = 0 THEN RETURN p_new_stake; END IF;

  v_is_market_bet := v_pred.market_text IS NOT NULL;

  IF v_diff > 0 THEN
    -- Increase: debit extra stake
    PERFORM public.wallet_apply_change(
      p_user_id, 'debit'::public.wallet_txn_type, v_diff,
      'bet_placement'::public.wallet_ref_type, v_pred.id,
      'Bet stake increased', v_sim);
    IF v_is_market_bet OR v_pred.match_id IS NULL THEN
      PERFORM public.platform_apply_change(
        'stake_collected'::public.platform_txn_type, v_diff,
        v_pred.id, v_pred.match_id, 'Stake increase collected', v_sim);
    ELSE
      PERFORM public.pool_apply_change(
        v_pred.match_id, v_pred.outcome, v_diff, 'stake_held',
        v_pred.id, p_user_id, 'Stake increased — held in pool');
    END IF;
  ELSE
    -- Decrease: refund the difference
    PERFORM public.wallet_apply_change(
      p_user_id, 'refund'::public.wallet_txn_type, -v_diff,
      'bet_settlement'::public.wallet_ref_type, v_pred.id,
      'Bet stake decreased — partial refund', v_sim);
    IF v_is_market_bet OR v_pred.match_id IS NULL THEN
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, -v_diff,
        v_pred.id, v_pred.match_id, 'Stake decrease refunded', v_sim);
    ELSE
      PERFORM public.pool_apply_change(
        v_pred.match_id, v_pred.outcome, -v_diff, 'void_refund_from_pool',
        v_pred.id, p_user_id, 'Stake decreased — refunded from pool');
    END IF;
  END IF;

  UPDATE public.predictions
     SET virtual_stake = p_new_stake,
         potential_return = v_new_potential
   WHERE id = v_pred.id;

  IF NOT v_is_market_bet AND v_pred.match_id IS NOT NULL AND v_pred.market = 'result'::public.prediction_market THEN
    PERFORM public.recalc_match_liabilities(v_pred.match_id);
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
    VALUES (p_user_id, 'prediction.edit_stake', 'prediction', v_pred.id,
            jsonb_build_object('old_stake', v_pred.virtual_stake, 'new_stake', p_new_stake), v_sim);

  RETURN p_new_stake;
END $$;

-- Cancel a pending bet entirely: refund full stake and void the prediction.
CREATE OR REPLACE FUNCTION public.cancel_pending_bet(
  p_user_id uuid,
  p_prediction_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pred public.predictions%ROWTYPE;
  v_match RECORD;
  v_sim boolean;
  v_is_market_bet boolean;
BEGIN
  IF p_user_id IS NULL OR p_prediction_id IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT * INTO v_pred FROM public.predictions WHERE id = p_prediction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_pred.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_pred.status <> 'pending'::public.prediction_status THEN
    RAISE EXCEPTION 'BET_NOT_PENDING';
  END IF;

  IF v_pred.match_id IS NOT NULL THEN
    SELECT id, kickoff_at, status, is_simulation INTO v_match
      FROM public.matches WHERE id = v_pred.match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
  ELSE
    v_sim := COALESCE(v_pred.is_simulation, false);
  END IF;

  v_is_market_bet := v_pred.market_text IS NOT NULL;

  -- Refund full stake to the user
  PERFORM public.wallet_apply_change(
    p_user_id, 'refund'::public.wallet_txn_type, v_pred.virtual_stake,
    'bet_settlement'::public.wallet_ref_type, v_pred.id,
    'Bet cancelled by user — full refund', v_sim);

  IF v_is_market_bet OR v_pred.match_id IS NULL THEN
    PERFORM public.platform_apply_change(
      'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
      v_pred.id, v_pred.match_id, 'Bet cancellation refund', v_sim);
  ELSE
    PERFORM public.pool_apply_change(
      v_pred.match_id, v_pred.outcome, v_pred.virtual_stake, 'void_refund_from_pool',
      v_pred.id, p_user_id, 'Bet cancellation refund from pool');
  END IF;

  UPDATE public.predictions
     SET status = 'void'::public.prediction_status,
         settled_at = now(),
         settled_result = 'cancelled_by_user'
   WHERE id = v_pred.id;

  IF NOT v_is_market_bet AND v_pred.match_id IS NOT NULL AND v_pred.market = 'result'::public.prediction_market THEN
    PERFORM public.recalc_match_liabilities(v_pred.match_id);
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
    VALUES (p_user_id, 'prediction.cancel', 'prediction', v_pred.id,
            jsonb_build_object('stake_refunded', v_pred.virtual_stake), v_sim);

  RETURN v_pred.id;
END $$;
