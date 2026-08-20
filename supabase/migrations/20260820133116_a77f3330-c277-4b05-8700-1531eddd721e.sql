ALTER TABLE public.csse_token_wallets
  ADD COLUMN IF NOT EXISTS last_daily_claim_on date;

CREATE OR REPLACE FUNCTION public.claim_daily_csse_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
  v_last date;
  v_amount bigint := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  INSERT INTO public.csse_token_wallets (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_daily_claim_on INTO v_last
    FROM public.csse_token_wallets
   WHERE user_id = v_uid
   FOR UPDATE;

  IF v_last IS NOT NULL AND v_last = v_today THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  PERFORM public.csse_credit_tokens(
    v_uid,
    v_amount,
    'earn',
    'daily_claim',
    v_today::text,
    jsonb_build_object('day', v_today::text)
  );

  UPDATE public.csse_token_wallets
     SET last_daily_claim_on = v_today
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'day', v_today);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_daily_csse_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_csse_tokens() TO authenticated, service_role;