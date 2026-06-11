-- Allow negative house bankroll (it now represents cumulative P/L, not seed capital)
CREATE OR REPLACE FUNCTION public.platform_apply_change(p_type platform_txn_type, p_amount numeric, p_bet_id uuid DEFAULT NULL::uuid, p_match_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_is_simulation boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC; v_row_id INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'platform: amount must be positive'; END IF;
  v_row_id := CASE WHEN p_is_simulation THEN 2 ELSE 1 END;

  SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll(id,balance) VALUES (v_row_id,0) ON CONFLICT (id) DO NOTHING;
    SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  END IF;

  IF p_type IN ('stake_collected','admin_topup','match_pool_collected') THEN
    v_signed := p_amount;
  ELSE
    v_signed := -p_amount;
  END IF;

  v_after := v_before + v_signed;
  -- Allow negative balance for the real bankroll: it now represents cumulative profit/loss.
  -- Withdrawals (admin_withdrawal) still require sufficient balance.
  IF v_after < 0 AND p_type = 'admin_withdrawal' THEN
    RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE';
  END IF;

  UPDATE public.platform_bankroll
     SET balance=v_after,
         total_stakes_collected = total_stakes_collected
           + CASE WHEN p_type IN ('stake_collected','match_pool_collected') THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid
           + CASE WHEN p_type='payout_paid' THEN p_amount ELSE 0 END,
         updated_at=now()
   WHERE id=v_row_id;

  INSERT INTO public.platform_transactions(
    bet_id,match_id,transaction_type,amount,balance_before,balance_after,note,is_simulation
  ) VALUES (p_bet_id,p_match_id,p_type,p_amount,v_before,v_after,p_note,p_is_simulation);

  RETURN v_after;
END $function$;

-- Drop the bankroll-based exposure cap so bets work with a P/L-only display.
CREATE OR REPLACE FUNCTION public.place_bet_atomic(p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid, p_cap_pct numeric DEFAULT 1.0, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD;
  v_sim BOOLEAN := false;
  v_existing UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id
      LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  v_potential := ROUND(p_stake * p_odds, 2);

  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status,is_simulation INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
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
    RAISE EXCEPTION 'DUPLICATE_REQUEST';
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

-- Drop the older 8-arg overload to keep a single definition.
DROP FUNCTION IF EXISTS public.place_bet_atomic(uuid, uuid, prediction_market, text, numeric, numeric, uuid, numeric);