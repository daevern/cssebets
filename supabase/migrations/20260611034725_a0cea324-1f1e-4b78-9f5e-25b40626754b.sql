
-- platform_apply_change: treat match_pool_collected as positive and count toward stakes
CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type platform_txn_type, p_amount numeric,
  p_bet_id uuid DEFAULT NULL, p_match_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'platform: amount must be positive'; END IF;

  SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=1 FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll(id,balance) VALUES (1,0) ON CONFLICT (id) DO NOTHING;
    SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=1 FOR UPDATE;
  END IF;

  IF p_type IN ('stake_collected','admin_topup','match_pool_collected') THEN
    v_signed := p_amount;
  ELSE
    v_signed := -p_amount;
  END IF;

  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.platform_bankroll
     SET balance=v_after,
         total_stakes_collected = total_stakes_collected
           + CASE WHEN p_type IN ('stake_collected','match_pool_collected') THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid
           + CASE WHEN p_type='payout_paid' THEN p_amount ELSE 0 END,
         updated_at=now()
   WHERE id=1;

  INSERT INTO public.platform_transactions(bet_id,match_id,transaction_type,amount,balance_before,balance_after,note)
    VALUES (p_bet_id,p_match_id,p_type,p_amount,v_before,v_after,p_note);

  RETURN v_after;
END $$;

-- helper: add to pool + ledger
CREATE OR REPLACE FUNCTION public.pool_apply_change(
  p_match_id uuid, p_outcome text, p_amount numeric, p_type text,
  p_prediction_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_desc text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC;
BEGIN
  INSERT INTO public.match_stake_pools(match_id) VALUES (p_match_id)
    ON CONFLICT (match_id) DO NOTHING;
  SELECT total_pool INTO v_before FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;

  IF p_type = 'stake_held' THEN v_signed := p_amount;
  ELSE v_signed := -p_amount; END IF;

  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'POOL_INSUFFICIENT'; END IF;

  UPDATE public.match_stake_pools
     SET total_pool = v_after,
         home_pool = home_pool + CASE WHEN p_outcome='HOME' THEN v_signed ELSE 0 END,
         draw_pool = draw_pool + CASE WHEN p_outcome='DRAW' THEN v_signed ELSE 0 END,
         away_pool = away_pool + CASE WHEN p_outcome='AWAY' THEN v_signed ELSE 0 END,
         updated_at = now()
   WHERE match_id=p_match_id;

  INSERT INTO public.match_pool_transactions(
    match_id,prediction_id,user_id,transaction_type,amount,pool_balance_before,pool_balance_after,description)
    VALUES (p_match_id,p_prediction_id,p_user_id,p_type,p_amount,v_before,v_after,p_desc);
  RETURN v_after;
END $$;

-- place_bet_atomic: debit user, add to pool, exposure-check against bankroll, NO bankroll credit
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text,
  p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds  IS NULL OR p_odds  < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  v_potential := ROUND(p_stake * p_odds, 2);

  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
  END IF;

  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=1 FOR UPDATE;

  IF p_match_id IS NOT NULL AND p_market='result'::public.prediction_market AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h,v_d,v_a
    FROM public.predictions
    WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h,v_d,v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum FROM public.matches WHERE id <> p_match_id;
    IF v_bankroll < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;

  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type,p_stake,
    'bet_placement'::public.wallet_ref_type,gen_random_uuid(),'Bet placed (stake_debit)');

  INSERT INTO public.predictions(
    user_id,match_id,market,outcome,reference_odds,
    reference_odds_snapshot_id,virtual_stake,potential_return)
   VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential)
   RETURNING id INTO v_pred_id;

  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  END IF;

  RETURN v_pred_id;
END $$;

-- settle_match_atomic: transfer pool -> bankroll, then payout winners
CREATE OR REPLACE FUNCTION public.settle_match_atomic(
  p_match_id uuid, p_home_score integer, p_away_score integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC;
  v_winner TEXT; v_total INT; v_line NUMERIC; v_dir TEXT;
  v_pool RECORD;
BEGIN
  PERFORM 1 FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  INSERT INTO public.match_stake_pools(match_id) VALUES (p_match_id) ON CONFLICT (match_id) DO NOTHING;
  SELECT * INTO v_pool FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;
  IF v_pool.settled THEN
    RETURN 0; -- idempotent
  END IF;

  UPDATE public.matches
     SET status='finished'::public.match_status,
         home_score=p_home_score, away_score=p_away_score,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  -- Transfer pool to bankroll
  IF v_pool.total_pool > 0 THEN
    PERFORM public.platform_apply_change(
      'match_pool_collected'::public.platform_txn_type, v_pool.total_pool,
      NULL, p_match_id, 'Pool transferred to bankroll on settlement');
    PERFORM public.pool_apply_change(
      p_match_id, NULL, v_pool.total_pool, 'pool_transferred_to_bankroll',
      NULL, NULL, 'Pool drained to bankroll');
  END IF;

  IF p_home_score > p_away_score THEN v_winner := 'HOME';
  ELSIF p_home_score < p_away_score THEN v_winner := 'AWAY';
  ELSE v_winner := 'DRAW'; END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
    FOR UPDATE
  LOOP
    v_won := FALSE; v_payout := 0;
    IF v_pred.market='result'::public.prediction_market THEN v_won := v_pred.outcome = v_winner;
    ELSIF v_pred.market='correct_score'::public.prediction_market THEN v_won := v_pred.outcome = (p_home_score||'-'||p_away_score);
    ELSIF v_pred.market='total_goals'::public.prediction_market THEN
      v_total := p_home_score + p_away_score;
      v_dir := split_part(v_pred.outcome,'_',1);
      v_line := NULLIF(split_part(v_pred.outcome,'_',2),'')::NUMERIC;
      IF v_line IS NOT NULL THEN
        v_won := (v_dir='OVER' AND v_total>v_line) OR (v_dir='UNDER' AND v_total<v_line);
      END IF;
    ELSIF v_pred.market='btts'::public.prediction_market THEN
      v_won := (v_pred.outcome='YES' AND p_home_score>0 AND p_away_score>0)
            OR (v_pred.outcome='NO'  AND (p_home_score=0 OR p_away_score=0));
    END IF;

    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won'::public.prediction_status, points=3, settled_at=now() WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout (payout_credit)');
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Payout for winning bet');
    ELSE
      UPDATE public.predictions SET status='lost'::public.prediction_status, points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.match_stake_pools
     SET settled=true, settled_at=now() WHERE match_id=p_match_id;

  RETURN v_settled;
END $$;

-- void_match_atomic: refund from pool if not transferred, else from bankroll
CREATE OR REPLACE FUNCTION public.void_match_atomic(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pred RECORD; v_count INT := 0; v_pool RECORD; v_from_pool BOOLEAN;
BEGIN
  PERFORM 1 FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  INSERT INTO public.match_stake_pools(match_id) VALUES (p_match_id) ON CONFLICT (match_id) DO NOTHING;
  SELECT * INTO v_pool FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;
  v_from_pool := NOT v_pool.settled;

  UPDATE public.matches
     SET status='cancelled'::public.match_status,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
    FOR UPDATE
  LOOP
    UPDATE public.predictions SET status='void'::public.prediction_status, settled_at=now() WHERE id=v_pred.id;
    PERFORM public.wallet_apply_change(
      v_pred.user_id,'refund'::public.wallet_txn_type,v_pred.virtual_stake,
      'bet_settlement'::public.wallet_ref_type,v_pred.id,'Void refund');
    IF v_from_pool THEN
      PERFORM public.pool_apply_change(
        p_match_id, v_pred.outcome, v_pred.virtual_stake, 'void_refund_from_pool',
        v_pred.id, v_pred.user_id, 'Void refund from pool');
    ELSE
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
        v_pred.id, p_match_id, 'Void refund from bankroll (post-settlement)');
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.match_stake_pools
     SET voided=true, settled=true, settled_at=COALESCE(settled_at,now())
   WHERE match_id=p_match_id;

  RETURN v_count;
END $$;
