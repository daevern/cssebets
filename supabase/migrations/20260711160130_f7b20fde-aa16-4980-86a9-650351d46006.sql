
-- 1) Per-fight margin toggle (mirror matches.margin_disabled)
ALTER TABLE public.ufc_fights
  ADD COLUMN IF NOT EXISTS margin_disabled boolean NOT NULL DEFAULT false;

-- 2) Void a single UFC bet (refund stake, mark void, audit-friendly)
CREATE OR REPLACE FUNCTION public.void_ufc_bet_manual(
  p_bet_id uuid,
  p_actor_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bet   public.ufc_bets%ROWTYPE;
  v_bal   numeric;
  v_new   numeric;
BEGIN
  SELECT * INTO v_bet FROM public.ufc_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF v_bet.status <> 'open' THEN RAISE EXCEPTION 'Cannot void a % bet', v_bet.status; END IF;

  SELECT balance INTO v_bal
    FROM public.wallets
    WHERE user_id = v_bet.user_id AND is_simulation = false
    FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  v_new := v_bal + v_bet.stake;
  UPDATE public.wallets SET balance = v_new, updated_at = now()
    WHERE user_id = v_bet.user_id AND is_simulation = false;

  UPDATE public.ufc_bets
     SET status = 'void', payout = v_bet.stake, settled_at = now()
   WHERE id = v_bet.id;

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, bet_id, metadata
  ) VALUES (
    v_bet.user_id, 'refund', v_bet.stake, v_bal, v_new,
    'bet_settlement', v_bet.id,
    'UFC bet voided by admin: ' || COALESCE(p_reason,''),
    'ufc_bet', v_bet.id,
    jsonb_build_object('fight_id', v_bet.fight_id, 'actor_id', p_actor_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'delta', v_bet.stake);
END;
$$;

-- 3) Regrade a single UFC bet with correct wallet delta
--    Payout model matches football: won pays stake*odds (gross), lost pays 0, void refunds stake, open reverts to pending (stake was already debited).
CREATE OR REPLACE FUNCTION public.regrade_ufc_bet_manual(
  p_bet_id uuid,
  p_new_status text,
  p_actor_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bet     public.ufc_bets%ROWTYPE;
  v_bal     numeric;
  v_new_bal numeric;
  v_old_pay numeric;  -- payout previously credited (0 when open/lost)
  v_new_pay numeric;  -- payout to credit now (0 when lost, stake when void, stake*odds when won, 0 when open)
  v_delta   numeric;
BEGIN
  IF p_new_status NOT IN ('open','won','lost','void') THEN
    RAISE EXCEPTION 'Invalid target status';
  END IF;

  SELECT * INTO v_bet FROM public.ufc_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF v_bet.status = p_new_status THEN RAISE EXCEPTION 'Already %', p_new_status; END IF;

  v_old_pay := COALESCE(v_bet.payout, 0);
  v_new_pay := CASE p_new_status
                 WHEN 'won'  THEN ROUND(v_bet.stake * v_bet.odds_locked, 2)
                 WHEN 'void' THEN v_bet.stake
                 ELSE 0
               END;
  v_delta := v_new_pay - v_old_pay;

  SELECT balance INTO v_bal
    FROM public.wallets
    WHERE user_id = v_bet.user_id AND is_simulation = false
    FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  v_new_bal := v_bal + v_delta;
  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'Regrade would overdraw wallet (delta %, balance %)', v_delta, v_bal;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now()
      WHERE user_id = v_bet.user_id AND is_simulation = false;

    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, bet_id, metadata
    ) VALUES (
      v_bet.user_id,
      CASE WHEN v_delta > 0 THEN 'credit' ELSE 'debit' END,
      ABS(v_delta), v_bal, v_new_bal,
      'bet_regrade', v_bet.id,
      'UFC bet regrade ' || v_bet.status || ' -> ' || p_new_status || ': ' || COALESCE(p_reason,''),
      'ufc_bet', v_bet.id,
      jsonb_build_object('actor_id', p_actor_id, 'reason', p_reason,
                         'from', v_bet.status, 'to', p_new_status)
    );
  END IF;

  UPDATE public.ufc_bets
     SET status     = p_new_status,
         payout     = CASE WHEN p_new_status = 'open' THEN NULL ELSE v_new_pay END,
         settled_at = CASE WHEN p_new_status = 'open' THEN NULL ELSE now() END
   WHERE id = v_bet.id;

  RETURN jsonb_build_object('ok', true, 'delta', v_delta,
                            'from', v_bet.status, 'to', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.void_ufc_bet_manual(uuid, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.regrade_ufc_bet_manual(uuid, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.void_ufc_bet_manual(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.regrade_ufc_bet_manual(uuid, text, uuid, text) TO service_role;
