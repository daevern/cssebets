DO $$
DECLARE u uuid; b numeric;
BEGIN
  FOREACH u IN ARRAY ARRAY['f15582b9-f9e0-4ec1-9f59-028c6c08a0c0'::uuid,'b92c27fb-d33a-4a7e-a8f3-8746c6cc624a'::uuid] LOOP
    INSERT INTO public.wallets (user_id, balance) VALUES (u, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO b FROM public.wallets WHERE user_id = u FOR UPDATE;
    UPDATE public.wallets SET balance = b + 100, updated_at = now() WHERE user_id = u;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_before, balance_after, reference_type, note, transaction_category)
    VALUES (u, 'credit', 100, b, b + 100, 'admin_adjustment', 'Manual goodwill credit: 100 points', 'admin_adjustment');
  END LOOP;
END $$;