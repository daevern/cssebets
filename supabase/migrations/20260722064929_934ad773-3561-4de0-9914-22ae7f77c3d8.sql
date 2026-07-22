
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta_phone   TEXT;
  v_ref_code     TEXT;
  v_referrer     UUID;
  v_referral_id  UUID;
  v_is_anon      BOOLEAN := COALESCE(NEW.is_anonymous, false);
BEGIN
  v_meta_phone := NULLIF(NEW.raw_user_meta_data->>'phone_number', '');
  v_ref_code   := upper(NULLIF(NEW.raw_user_meta_data->>'referral_code', ''));

  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference, referred_by_code)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      v_meta_phone,
      split_part(COALESCE(NEW.email, ''), '@', 1),
      NULLIF(NEW.phone, ''),
      CASE WHEN v_is_anon THEN 'Guest' ELSE NULL END
    ),
    COALESCE(NULLIF(NEW.phone, ''), v_meta_phone),
    CASE
      WHEN v_is_anon THEN 'anonymous'
      WHEN (NEW.phone IS NOT NULL AND NEW.phone <> '') OR v_meta_phone IS NOT NULL THEN 'phone'
      ELSE 'email'
    END,
    public.generate_public_reference(),
    CASE WHEN v_is_anon THEN NULL ELSE v_ref_code END
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider);

  -- Anonymous guests get instant member access so the demo works without approval.
  IF v_is_anon THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member')
      ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;

  IF v_ref_code IS NOT NULL THEN
    SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = v_ref_code LIMIT 1;
    IF v_referrer IS NOT NULL AND v_referrer = NEW.id THEN
      INSERT INTO public.audit_log (user_id, action, entity, metadata)
      VALUES (NEW.id, 'referral_self_blocked', 'referrals',
              jsonb_build_object('code', v_ref_code));
    ELSIF v_referrer IS NOT NULL THEN
      INSERT INTO public.referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (v_referrer, NEW.id, v_ref_code)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING id INTO v_referral_id;

      INSERT INTO public.audit_log (user_id, action, entity, metadata)
      VALUES (NEW.id, 'referral_attributed', 'referrals',
              jsonb_build_object('code', v_ref_code, 'referrer_user_id', v_referrer));

      IF v_referral_id IS NOT NULL THEN
        PERFORM public.csse_credit_tokens(
          NEW.id, 50, 'earn', 'referral_signup_bonus', v_referral_id::text,
          jsonb_build_object('referrer_user_id', v_referrer, 'code', v_ref_code, 'tokens', 50)
        );
        INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
        VALUES (NEW.id, 'referral_signup_bonus_awarded', 'referrals', v_referral_id,
                jsonb_build_object('referrer_user_id', v_referrer, 'tokens', 50));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $function$;
