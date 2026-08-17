CREATE OR REPLACE FUNCTION public.demo_guest_reset()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_anon  boolean;
  v_bal   numeric;
  v_diff  numeric;
  v_target CONSTANT numeric := 1000;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT coalesce(u.is_anonymous, false) INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF NOT coalesce(v_anon, false) THEN
    RAISE EXCEPTION 'DEMO_ONLY: only anonymous guest sessions have a demo wallet';
  END IF;

  UPDATE public.profiles SET is_simulation = true WHERE id = v_uid;

  INSERT INTO public.wallets(user_id, is_simulation) VALUES (v_uid, true)
    ON CONFLICT (user_id) DO UPDATE SET is_simulation = true;

  -- Guests must live entirely in the practice environment.
  UPDATE public.accounting_accounts
     SET status = 'CLOSED', closed_at = now()
   WHERE user_id = v_uid AND account_code = 'USER_WALLET'
     AND environment <> 'SIMULATION' AND status = 'ACTIVE';

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts
     WHERE user_id = v_uid AND account_code = 'USER_WALLET'
       AND environment = 'SIMULATION' AND status = 'ACTIVE'
  ) THEN
    INSERT INTO public.accounting_accounts
      (account_code, account_type, normal_balance, environment, currency_or_unit, status, user_id, metadata)
    VALUES
      ('USER_WALLET', 'LIABILITY', 'CREDIT', 'SIMULATION', 'POINTS', 'ACTIVE', v_uid,
       jsonb_build_object('legacy_wallet_user_id', v_uid, 'demo_guest', true));
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  v_diff := v_target - coalesce(v_bal, 0);

  IF v_diff > 0 THEN
    PERFORM public.wallet_apply_change(
      v_uid, 'credit', v_diff, 'admin_adjustment', gen_random_uuid(),
      'Demo wallet reset to 1000 practice points', true);
  ELSIF v_diff < 0 THEN
    PERFORM public.wallet_apply_change(
      v_uid, 'debit', -v_diff, 'admin_adjustment', gen_random_uuid(),
      'Demo wallet reset to 1000 practice points', true);
  END IF;

  RETURN v_target;
END
$function$;

REVOKE ALL ON FUNCTION public.demo_guest_reset() FROM public;
GRANT EXECUTE ON FUNCTION public.demo_guest_reset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.demo_guest_reset() TO service_role;