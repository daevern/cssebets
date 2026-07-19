
-- Finalize a UFC fight by voiding any remaining open bets (refund stake) and
-- flipping status to 'finished'. Used after winner-only auto-settle when the
-- provider doesn't expose method/ending-round (API-Sports MMA /fights feed
-- returns only the winner boolean per fighter — no method or finishing round),
-- so bets on round/total_rounds/method markets can't be graded and must be
-- refunded rather than sit PENDING forever.
CREATE OR REPLACE FUNCTION public.finalize_ufc_fight_void_remaining(p_fight_id uuid, p_reason text DEFAULT 'provider_missing_method')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fight record;
  v_bet record;
  v_bal numeric;
  v_new_bal numeric;
  v_settled int := 0;
BEGIN
  SELECT * INTO v_fight FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;

  FOR v_bet IN
    SELECT * FROM public.ufc_bets
    WHERE fight_id = p_fight_id AND status = 'open'
    FOR UPDATE
  LOOP
    SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
    IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    v_new_bal := v_bal + v_bet.stake;

    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
    UPDATE public.ufc_bets SET status = 'void', payout = v_bet.stake, settled_at = now() WHERE id = v_bet.id;

    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, is_simulation,
      transaction_category, bet_id, metadata
    ) VALUES (
      v_bet.user_id, 'refund', v_bet.stake, v_bal, v_new_bal,
      'bet_settlement', v_bet.id,
      'UFC ' || v_bet.market_type || ' void (' || p_reason || ')', false,
      'ufc_bet', v_bet.id,
      jsonb_build_object('fight_id', p_fight_id, 'reason', p_reason, 'auto', true)
    );

    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.ufc_fights
     SET status = 'finished', settled_at = COALESCE(settled_at, now()), updated_at = now()
   WHERE id = p_fight_id;

  RETURN v_settled;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_ufc_fight_void_remaining(uuid, text) TO service_role;
