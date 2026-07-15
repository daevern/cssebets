DO $$
DECLARE
  v_referred UUID := 'b08536f2-eff4-416c-affe-83fd5ee17d43';
  v_code     TEXT := '9W928VQ';
  v_referrer UUID;
  v_referral UUID;
  v_existing UUID;
BEGIN
  SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = v_code LIMIT 1;
  IF v_referrer IS NULL THEN RAISE EXCEPTION 'Referrer for code % not found', v_code; END IF;

  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  UPDATE public.profiles
     SET referred_by_code = v_code
   WHERE id = v_referred AND (referred_by_code IS NULL OR referred_by_code = '');
  ALTER TABLE public.profiles ENABLE TRIGGER USER;

  SELECT id INTO v_existing FROM public.referrals WHERE referred_user_id = v_referred;
  IF v_existing IS NULL THEN
    INSERT INTO public.referrals (referrer_user_id, referred_user_id, referral_code)
    VALUES (v_referrer, v_referred, v_code)
    RETURNING id INTO v_referral;

    PERFORM public.csse_credit_tokens(
      v_referred, 25, 'earn', 'referral_signup_bonus', v_referral::text,
      jsonb_build_object('referrer_user_id', v_referrer, 'code', v_code, 'tokens', 25, 'backfill', true)
    );

    INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
    VALUES (v_referred, 'referral_signup_bonus_awarded', 'referrals', v_referral,
            jsonb_build_object('referrer_user_id', v_referrer, 'tokens', 25, 'backfill', true));

    INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
    VALUES (v_referred, 'referral_attributed_backfill', 'referrals', v_referral,
            jsonb_build_object('code', v_code, 'referrer_user_id', v_referrer));
  END IF;

  PERFORM public.award_referral_milestones(v_referred);
END $$;