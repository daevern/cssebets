
-- 1) Extend wallet_apply_change categorization to detect score-correction reversals via note text.
CREATE OR REPLACE FUNCTION public.wallet_apply_change(
  p_user_id uuid, p_type wallet_txn_type, p_amount numeric,
  p_reference_type wallet_ref_type, p_reference_id uuid,
  p_note text DEFAULT NULL::text, p_is_simulation boolean DEFAULT false
)
RETURNS TABLE(new_balance numeric, txn_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC; v_after NUMERIC; v_txn UUID; v_cat text; v_bet uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'wallet: amount must be positive'; END IF;
  INSERT INTO public.wallets(user_id, is_simulation) VALUES (p_user_id, p_is_simulation)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_before FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  IF p_type='debit' THEN
    v_after := v_before - p_amount;
    IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  ELSE
    v_after := v_before + p_amount;
  END IF;
  UPDATE public.wallets SET balance=v_after, updated_at=now() WHERE user_id=p_user_id;

  v_cat := CASE
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'debit'
         AND COALESCE(p_note,'') ILIKE '%Auto-reversal%' THEN 'settlement_reversal'
    WHEN p_reference_type = 'bet_placement' AND p_type = 'debit' THEN 'bet_stake_debit'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'refund' THEN 'bet_void_refund'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'credit' AND COALESCE(p_note,'') ILIKE 'void%' THEN 'bet_void_refund'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'credit' THEN 'bet_win_credit'
    WHEN p_reference_type = 'admin_adjustment' AND p_type = 'credit' THEN 'admin_adjustment_credit'
    WHEN p_reference_type = 'admin_adjustment' AND p_type = 'debit'  THEN 'admin_adjustment_debit'
    WHEN p_reference_type = 'point_request'   AND p_type = 'credit' THEN 'deposit_credit'
    WHEN p_reference_type = 'point_request'   AND p_type = 'debit'  THEN 'withdrawal_debit'
    WHEN p_reference_type = 'payout'          AND p_type = 'debit'  THEN 'payout_completed'
    WHEN p_reference_type = 'payout'          AND p_type = 'credit' THEN 'payout_reversed'
    WHEN p_reference_type = 'house_bankroll'  THEN 'house_bankroll_movement'
    ELSE 'uncategorized'
  END;
  IF p_reference_type IN ('bet_placement','bet_settlement') THEN v_bet := p_reference_id; ELSE v_bet := NULL; END IF;

  INSERT INTO public.wallet_transactions(
    user_id,type,amount,balance_before,balance_after,reference_type,reference_id,note,is_simulation,
    transaction_category, bet_id
  ) VALUES (
    p_user_id,p_type,p_amount,v_before,v_after,p_reference_type,p_reference_id,p_note,p_is_simulation,
    v_cat, v_bet
  ) RETURNING id INTO v_txn;

  RETURN QUERY SELECT v_after, v_txn;
END $function$;

-- 2) Enrich the reversal routine to stamp metadata on the reversal wallet rows.
CREATE OR REPLACE FUNCTION public.reverse_settled_predictions_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD;
  v_payout numeric;
  v_count int := 0;
  v_sim boolean;
  v_txn uuid;
  v_match RECORD;
  v_amount numeric;
  v_reason text;
  v_orig_status text;
BEGIN
  SELECT COALESCE(is_simulation,false) AS is_sim, home_score, away_score
    INTO v_match FROM public.matches WHERE id = p_match_id;
  v_sim := COALESCE(v_match.is_sim,false);

  FOR v_pred IN
    SELECT * FROM public.predictions
     WHERE match_id = p_match_id
       AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status,'void'::public.prediction_status)
     FOR UPDATE
  LOOP
    v_orig_status := v_pred.status::text;
    IF v_pred.status = 'won'::public.prediction_status THEN
      v_amount := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      v_reason := 'Auto-reversal: match score corrected';
      SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_amount,
        'bet_settlement'::public.wallet_ref_type, v_pred.id, v_reason, v_sim);
      PERFORM public.platform_apply_change(
        'payout_clawback'::public.platform_txn_type, v_amount, v_pred.id, p_match_id, v_reason, v_sim);
    ELSIF v_pred.status = 'void'::public.prediction_status THEN
      v_amount := v_pred.virtual_stake;
      v_reason := 'Auto-reversal of void: match score corrected';
      SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_amount,
        'bet_settlement'::public.wallet_ref_type, v_pred.id, v_reason, v_sim);
      PERFORM public.platform_apply_change(
        'stake_collected'::public.platform_txn_type, v_amount, v_pred.id, p_match_id, v_reason, v_sim);
    ELSE
      v_txn := NULL;
    END IF;

    IF v_txn IS NOT NULL THEN
      UPDATE public.wallet_transactions
         SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
               'original_prediction_id', v_pred.id,
               'match_id', p_match_id,
               'new_home_score', v_match.home_score,
               'new_away_score', v_match.away_score,
               'reversal_reason', v_reason,
               'original_status', v_orig_status,
               'corrected_status', 'pending',
               'reversal_amount', v_amount
             )
       WHERE id = v_txn;
    END IF;

    UPDATE public.predictions
       SET status='pending'::public.prediction_status,
           points=0,
           settled_at=NULL,
           settled_result=NULL
     WHERE id = v_pred.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

-- 3) Backfill only the two known recent reversal rows.
UPDATE public.wallet_transactions
   SET transaction_category = 'settlement_reversal'
 WHERE id IN (
   '951d8204-6270-4086-9eab-a17aac7da4b9',
   'c6c0eafb-609a-4732-a73a-24acbf5f4a3c'
 )
   AND transaction_category = 'uncategorized'
   AND reference_type = 'bet_settlement'
   AND type = 'debit'
   AND note ILIKE '%Auto-reversal%';
