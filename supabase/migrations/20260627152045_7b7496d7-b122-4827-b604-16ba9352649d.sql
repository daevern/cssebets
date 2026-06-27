-- Fix: payout_clawback was wrongly treated as a debit on platform_bankroll.balance.
-- Semantically, a clawback returns money to the bankroll, so it must be a credit.
CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type platform_txn_type, p_amount numeric, p_bet_id uuid DEFAULT NULL::uuid,
  p_match_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_is_simulation boolean DEFAULT false)
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

  IF p_type IN ('stake_collected','admin_topup','match_pool_collected','payout_clawback') THEN
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

-- Backfill correction: every historical clawback subtracted instead of added.
-- Net correction = +2 × SUM(clawbacks).
DO $$
DECLARE v_correction numeric; v_before numeric; v_after numeric;
BEGIN
  SELECT COALESCE(SUM(amount),0) * 2 INTO v_correction
    FROM public.platform_transactions
   WHERE is_simulation=false AND transaction_type='payout_clawback';

  IF v_correction > 0 THEN
    SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=1 FOR UPDATE;
    v_after := v_before + v_correction;
    UPDATE public.platform_bankroll SET balance = v_after, updated_at = now() WHERE id=1;
    INSERT INTO public.platform_transactions(transaction_type, amount, balance_before, balance_after, note, is_simulation)
    VALUES ('admin_topup', v_correction, v_before, v_after,
            'Reconciliation: backfill correction for payout_clawback sign bug (each clawback was debited instead of credited)', false);
  END IF;
END $$;