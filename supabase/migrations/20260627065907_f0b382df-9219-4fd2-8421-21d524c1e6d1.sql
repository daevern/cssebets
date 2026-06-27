
-- Update platform_apply_change: decrement total_payouts_paid on payout_clawback
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
  IF v_after < 0 AND p_type = 'admin_withdrawal' THEN
    RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE';
  END IF;

  UPDATE public.platform_bankroll
     SET balance=v_after,
         total_stakes_collected = total_stakes_collected
           + CASE WHEN p_type IN ('stake_collected','match_pool_collected') THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid
           + CASE WHEN p_type='payout_paid' THEN p_amount
                  WHEN p_type='payout_clawback' THEN -p_amount
                  ELSE 0 END,
         updated_at=now()
   WHERE id=v_row_id;

  INSERT INTO public.platform_transactions(transaction_type, amount, balance_before, balance_after, bet_id, match_id, note, is_simulation)
  VALUES (p_type, p_amount, v_before, v_after, p_bet_id, p_match_id, p_note, p_is_simulation);

  RETURN v_after;
END $function$;

-- Update reverse function to use payout_clawback for winning reversals
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
BEGIN
  SELECT COALESCE(is_simulation,false) INTO v_sim FROM public.matches WHERE id = p_match_id;
  FOR v_pred IN
    SELECT * FROM public.predictions
     WHERE match_id = p_match_id
       AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status,'void'::public.prediction_status)
     FOR UPDATE
  LOOP
    IF v_pred.status = 'won'::public.prediction_status THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Auto-reversal: match score corrected', v_sim);
      PERFORM public.platform_apply_change(
        'payout_clawback'::public.platform_txn_type, v_payout, v_pred.id, p_match_id,
        'Auto-reversal: match score corrected', v_sim);
    ELSIF v_pred.status = 'void'::public.prediction_status THEN
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Auto-reversal of void: match score corrected', v_sim);
      PERFORM public.platform_apply_change(
        'stake_collected'::public.platform_txn_type, v_pred.virtual_stake, v_pred.id, p_match_id,
        'Auto-reversal of void: match score corrected', v_sim);
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

-- Backfill: re-tag historical auto-reversal rows and correct the counter
WITH reversed AS (
  SELECT id, amount FROM public.platform_transactions
   WHERE note = 'Auto-reversal: match score corrected'
     AND transaction_type = 'void_refund'
), totals AS (
  SELECT COALESCE(SUM(amount),0) AS s FROM reversed
)
UPDATE public.platform_bankroll
   SET total_payouts_paid = total_payouts_paid - (SELECT s FROM totals),
       updated_at = now()
 WHERE id = 1;

UPDATE public.platform_transactions
   SET transaction_type = 'payout_clawback'
 WHERE note = 'Auto-reversal: match score corrected'
   AND transaction_type = 'void_refund';
