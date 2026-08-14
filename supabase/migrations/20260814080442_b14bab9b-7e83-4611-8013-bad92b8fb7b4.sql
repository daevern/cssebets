DO $$
DECLARE v_user uuid := 'b92c27fb-d33a-4a7e-a8f3-8746c6cc624a';
        v_before numeric;
BEGIN
  SELECT balance INTO v_before FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.wallets (user_id, balance) VALUES (v_user, 0);
    v_before := 0;
  END IF;
  UPDATE public.wallets SET balance = v_before + 100 WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_before, balance_after, reference_type, note)
  VALUES (v_user, 'credit', 100, v_before, v_before + 100, 'admin_adjustment', 'Admin grant: 100 points');
END $$;