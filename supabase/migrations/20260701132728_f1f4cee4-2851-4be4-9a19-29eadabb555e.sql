
CREATE OR REPLACE FUNCTION public.reverse_settled_predictions_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD;
  v_count int := 0;
  v_sim boolean;
  v_txn uuid;
  v_match RECORD;
  v_amount numeric;
  v_reason text;
  v_orig_status text;
  v_actor uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

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
    v_txn := NULL;

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

      INSERT INTO public.audit_log(
        user_id, action, entity, entity_id, target_user_id, is_simulation, reason, metadata
      ) VALUES (
        v_actor, 'settlement_reversal', 'wallet_transaction', v_txn,
        v_pred.user_id, v_sim, v_reason,
        jsonb_build_object(
          'wallet_transaction_id', v_txn,
          'original_prediction_id', v_pred.id,
          'match_id', p_match_id,
          'new_home_score', v_match.home_score,
          'new_away_score', v_match.away_score,
          'original_status', v_orig_status,
          'corrected_status', 'pending',
          'reversal_amount', v_amount,
          'reversal_reason', v_reason,
          'transaction_category', 'settlement_reversal'
        )
      );
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
