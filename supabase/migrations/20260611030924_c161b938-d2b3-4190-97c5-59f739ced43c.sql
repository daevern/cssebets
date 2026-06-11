
-- 1. Extend wallet_ref_type enum
ALTER TYPE public.wallet_ref_type ADD VALUE IF NOT EXISTS 'house_bankroll';

-- 2. Add house_user_id column to bankroll singleton
ALTER TABLE public.platform_bankroll
  ADD COLUMN IF NOT EXISTS house_user_id UUID REFERENCES auth.users(id);

-- 3. Reset balances to 0 (start fresh per user request)
UPDATE public.platform_bankroll
   SET balance = 0,
       total_stakes_collected = 0,
       total_payouts_paid = 0,
       updated_at = now()
 WHERE id = 1;

-- 4. Replace platform_apply_change to mirror movements to the house wallet
CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type public.platform_txn_type,
  p_amount NUMERIC,
  p_bet_id UUID DEFAULT NULL,
  p_match_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC;
  v_house UUID;
  v_wallet_type public.wallet_txn_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'platform: amount must be positive';
  END IF;

  SELECT balance, house_user_id INTO v_before, v_house
    FROM public.platform_bankroll WHERE id = 1 FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll(id, balance) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;
    SELECT balance, house_user_id INTO v_before, v_house
      FROM public.platform_bankroll WHERE id = 1 FOR UPDATE;
  END IF;

  IF p_type IN ('stake_collected','admin_topup') THEN
    v_signed := p_amount;
    v_wallet_type := 'credit'::public.wallet_txn_type;
  ELSE
    v_signed := -p_amount;
    v_wallet_type := 'debit'::public.wallet_txn_type;
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

  -- Mirror to the designated house wallet, if set
  IF v_house IS NOT NULL THEN
    PERFORM public.wallet_apply_change(
      v_house, v_wallet_type, p_amount,
      'house_bankroll'::public.wallet_ref_type,
      COALESCE(p_bet_id, p_match_id, gen_random_uuid()),
      COALESCE(p_note, p_type::TEXT)
    );
  END IF;

  RETURN v_after;
END $$;

REVOKE ALL ON FUNCTION public.platform_apply_change(public.platform_txn_type, NUMERIC, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_apply_change(public.platform_txn_type, NUMERIC, UUID, UUID, TEXT) TO service_role;

-- 5. Setter to designate the house user (super_admin only)
CREATE OR REPLACE FUNCTION public.set_house_user(p_admin_id UUID, p_house_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_admin_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'super_admin only';
  END IF;
  IF p_house_user_id IS NULL THEN
    RAISE EXCEPTION 'house user required';
  END IF;
  INSERT INTO public.wallets(user_id) VALUES (p_house_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.platform_bankroll
     SET house_user_id = p_house_user_id, updated_at = now()
   WHERE id = 1;
  RETURN p_house_user_id;
END $$;

REVOKE ALL ON FUNCTION public.set_house_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_house_user(UUID, UUID) TO service_role;
