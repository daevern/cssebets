ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS auth_provider text;

CREATE INDEX IF NOT EXISTS profiles_phone_number_idx ON public.profiles (phone_number);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(COALESCE(NEW.email, ''), '@', 1),
      NULLIF(NEW.phone, '')
    ),
    NULLIF(NEW.phone, ''),
    CASE WHEN NEW.phone IS NOT NULL AND NEW.phone <> '' THEN 'phone' ELSE 'email' END
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;