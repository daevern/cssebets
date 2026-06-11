
-- 1) platform_apply_change: no more house-wallet mirroring
CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type public.platform_txn_type,
  p_amount numeric,
  p_bet_id uuid DEFAULT NULL,
  p_match_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'platform: amount must be positive';
  END IF;

  SELECT balance INTO v_before
    FROM public.platform_bankroll WHERE id = 1 FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll(id, balance) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;
    SELECT balance INTO v_before
      FROM public.platform_bankroll WHERE id = 1 FOR UPDATE;
  END IF;

  IF p_type IN ('stake_collected','admin_topup') THEN
    v_signed := p_amount;
  ELSE
    v_signed := -p_amount;
  END IF;

  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.platform_bankroll
     SET balance = v_after,
         total_stakes_collected = total_stakes_collected
           + CASE WHEN p_type = 'stake_collected' THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid
           + CASE WHEN p_type = 'payout_paid' THEN p_amount ELSE 0 END,
         updated_at = now()
   WHERE id = 1;

  INSERT INTO public.platform_transactions(
    bet_id, match_id, transaction_type, amount, balance_before, balance_after, note
  ) VALUES (
    p_bet_id, p_match_id, p_type, p_amount, v_before, v_after, p_note
  );

  RETURN v_after;
END $$;

-- 2) place_bet_atomic: global-exposure check using SUM(worst_case_exposure)
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market public.prediction_market,
  p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds  IS NULL OR p_odds  < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  v_potential := ROUND(p_stake * p_odds, 2);

  IF p_match_id IS NOT NULL THEN
    SELECT id, kickoff_at, status INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
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
      INTO v_h, v_d, v_a
    FROM public.predictions
    WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h, v_d, v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id;
    IF (v_bankroll + p_stake) < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;

  PERFORM public.wallet_apply_change(
    p_user_id, 'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(), 'Bet placed'
  );

  INSERT INTO public.predictions (
    user_id, match_id, market, outcome, reference_odds,
    reference_odds_snapshot_id, virtual_stake, potential_return
  ) VALUES (
    p_user_id, p_match_id, p_market, p_outcome, p_odds,
    p_snapshot_id, p_stake, v_potential
  ) RETURNING id INTO v_pred_id;

  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id, 'Stake collected'
  );

  IF p_match_id IS NOT NULL THEN
    PERFORM public.recalc_match_liabilities(p_match_id);
  END IF;
  RETURN v_pred_id;
END $$;
