CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta_phone text;
BEGIN
  v_meta_phone := NULLIF(NEW.raw_user_meta_data->>'phone_number', '');

  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      v_meta_phone,
      split_part(COALESCE(NEW.email, ''), '@', 1),
      NULLIF(NEW.phone, '')
    ),
    COALESCE(NULLIF(NEW.phone, ''), v_meta_phone),
    CASE
      WHEN (NEW.phone IS NOT NULL AND NEW.phone <> '') OR v_meta_phone IS NOT NULL THEN 'phone'
      ELSE 'email'
    END,
    public.generate_public_reference()
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;