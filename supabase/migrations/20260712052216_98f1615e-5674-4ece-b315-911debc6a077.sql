
CREATE OR REPLACE FUNCTION public.auto_settle_ufc_winner_atomic(
  p_fight_id uuid,
  p_winner text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fight record;
  v_bet record;
  v_bal numeric;
  v_new_bal numeric;
  v_won boolean;
  v_settled int := 0;
  v_action text;
BEGIN
  IF p_winner NOT IN ('a','b','draw') THEN
    RAISE EXCEPTION 'Invalid winner %', p_winner;
  END IF;

  SELECT * INTO v_fight FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight.status = 'finished' THEN RETURN 0; END IF;
  -- Idempotent: if we already recorded a winner via a previous auto-settle
  -- pass, do nothing (admin manual settle will finish the rest).
  IF v_fight.winner IS NOT NULL THEN RETURN 0; END IF;

  FOR v_bet IN
    SELECT * FROM public.ufc_bets
    WHERE fight_id = p_fight_id
      AND status = 'open'
      AND market_type IN ('moneyline','three_way')
    FOR UPDATE
  LOOP
    -- Moneyline has no "draw" selection: on a draw we void + refund.
    IF v_bet.market_type = 'moneyline' AND p_winner = 'draw' THEN
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
        'bet_settlement', v_bet.id, 'UFC moneyline void (draw)', false,
        'ufc_bet', v_bet.id,
        jsonb_build_object('fight_id', p_fight_id, 'winner', p_winner, 'auto', true)
      );

      v_settled := v_settled + 1;
      CONTINUE;
    END IF;

    v_won := (v_bet.selection_key = p_winner);

    IF v_won THEN
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
      IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
      v_new_bal := v_bal + v_bet.potential_payout;

      UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
      UPDATE public.ufc_bets SET status = 'won', payout = v_bet.potential_payout, settled_at = now() WHERE id = v_bet.id;

      INSERT INTO public.wallet_transactions(
        user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, note, is_simulation,
        transaction_category, bet_id, metadata
      ) VALUES (
        v_bet.user_id, 'credit', v_bet.potential_payout, v_bal, v_new_bal,
        'bet_settlement', v_bet.id, 'UFC bet won (auto)', false,
        'ufc_bet', v_bet.id,
        jsonb_build_object('fight_id', p_fight_id, 'winner', p_winner, 'auto', true)
      );
    ELSE
      UPDATE public.ufc_bets SET status = 'lost', payout = 0, settled_at = now() WHERE id = v_bet.id;
    END IF;

    v_settled := v_settled + 1;
  END LOOP;

  -- Record winner so we don't re-run; leave status='scheduled' so admin can
  -- finish method/round markets via the existing settle_ufc_fight_atomic.
  UPDATE public.ufc_fights
  SET winner = p_winner, updated_at = now()
  WHERE id = p_fight_id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
  VALUES (
    NULL, 'ufc.auto_settle_winner', 'ufc_fights', p_fight_id,
    jsonb_build_object('winner', p_winner, 'settled', v_settled)
  );

  RETURN v_settled;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_settle_ufc_winner_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_settle_ufc_winner_atomic(uuid, text) TO service_role;

-- Also relax the manual RPC so admin can still call it after auto-settle
-- recorded a winner but status is still 'scheduled'. It already checks
-- status='finished' and loops only status='open' bets, so it's safe.
