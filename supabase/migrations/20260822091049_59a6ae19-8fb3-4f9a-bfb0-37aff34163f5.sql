CREATE OR REPLACE FUNCTION public.settle_sports_market_atomic(p_market_id uuid, p_winning_selection_ids uuid[], p_void boolean DEFAULT false, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(bets_updated integer, total_payout numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_market RECORD;
  v_bet RECORD;
  v_bal NUMERIC;
  v_new_bal NUMERIC;
  v_payout NUMERIC;
  v_count INT := 0;
  v_total NUMERIC := 0;
BEGIN
  SELECT id, status, market_key, sports_event_id INTO v_market
    FROM public.sports_markets WHERE id = p_market_id FOR UPDATE;
  IF v_market.id IS NULL THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF v_market.status = 'settled' THEN RETURN QUERY SELECT 0, 0::NUMERIC; RETURN; END IF;

  IF p_void THEN
    UPDATE public.sports_market_selections SET result = 'void', status = 'closed', updated_at = now()
      WHERE sports_market_id = p_market_id;
  ELSE
    UPDATE public.sports_market_selections SET status = 'closed', updated_at = now(),
      result = CASE WHEN id = ANY(p_winning_selection_ids) THEN 'won' ELSE 'lost' END
      WHERE sports_market_id = p_market_id;
  END IF;

  FOR v_bet IN
    SELECT * FROM public.sports_bets
     WHERE sports_market_id = p_market_id AND status = 'pending'
     FOR UPDATE
  LOOP
    IF p_void THEN
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
      v_new_bal := COALESCE(v_bal,0) + v_bet.stake;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
      UPDATE public.sports_bets SET status='refunded', void_reason='market_voided',
             actual_payout = v_bet.stake, settled_at = now() WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,
             reference_type,reference_id,note,is_simulation,transaction_category,bet_id,metadata)
      VALUES (v_bet.user_id,'refund',v_bet.stake,COALESCE(v_bal,0),v_new_bal,'bet_settlement',v_bet.id,
             'Sports bet refunded',false,'sports_bet',v_bet.id,'{}'::jsonb);
      v_total := v_total + v_bet.stake;
    ELSIF v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN
      v_payout := ROUND(v_bet.stake * v_bet.accepted_odds, 2);
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
      v_new_bal := COALESCE(v_bal,0) + v_payout;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
      UPDATE public.sports_bets SET status='won', actual_payout = v_payout, settled_at = now() WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,
             reference_type,reference_id,note,is_simulation,transaction_category,bet_id,metadata)
      VALUES (v_bet.user_id,'credit',v_payout,COALESCE(v_bal,0),v_new_bal,'bet_settlement',v_bet.id,
             'Sports bet won',false,'sports_bet',v_bet.id,'{}'::jsonb);
      v_total := v_total + v_payout;
    ELSE
      UPDATE public.sports_bets SET status='lost', actual_payout = 0, settled_at = now() WHERE id = v_bet.id;
    END IF;

    IF p_run_id IS NOT NULL THEN
      INSERT INTO public.sports_settlement_items (settlement_run_id, sports_market_id, sports_bet_id, action, payout)
      VALUES (p_run_id, p_market_id, v_bet.id,
              CASE WHEN p_void THEN 'bet_refunded'
                   WHEN v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN 'bet_won'
                   ELSE 'bet_lost' END,
              CASE WHEN p_void THEN v_bet.stake
                   WHEN v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN ROUND(v_bet.stake * v_bet.accepted_odds, 2)
                   ELSE 0 END);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.sports_markets SET status = CASE WHEN p_void THEN 'void' ELSE 'settled' END,
         settled_at = now(),
         settlement_result = jsonb_build_object('winning_selection_ids', p_winning_selection_ids, 'void', p_void),
         updated_at = now()
   WHERE id = p_market_id;

  RETURN QUERY SELECT v_count, v_total;
END;
$function$;