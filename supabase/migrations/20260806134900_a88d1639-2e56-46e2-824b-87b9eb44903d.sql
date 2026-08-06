INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference, referred_by_code)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'display_name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    NULLIF(u.phone, ''),
    CASE WHEN COALESCE(u.is_anonymous, false) THEN 'Guest' ELSE 'Player' END
  ),
  COALESCE(NULLIF(u.phone, ''), NULLIF(u.raw_user_meta_data->>'phone_number', '')),
  CASE
    WHEN COALESCE(u.is_anonymous, false) THEN 'anonymous'
    WHEN NULLIF(u.phone, '') IS NOT NULL OR NULLIF(u.raw_user_meta_data->>'phone_number', '') IS NOT NULL THEN 'phone'
    ELSE 'email'
  END,
  public.generate_public_reference(),
  CASE
    WHEN COALESCE(u.is_anonymous, false) THEN NULL
    ELSE upper(NULLIF(u.raw_user_meta_data->>'referral_code', ''))
  END
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_user
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user not found';
  END IF;

  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference, referred_by_code)
  VALUES (
    v_user.id,
    COALESCE(
      NULLIF(v_user.raw_user_meta_data->>'display_name', ''),
      NULLIF(v_user.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(COALESCE(v_user.email, ''), '@', 1), ''),
      NULLIF(v_user.phone, ''),
      CASE WHEN COALESCE(v_user.is_anonymous, false) THEN 'Guest' ELSE 'Player' END
    ),
    COALESCE(NULLIF(v_user.phone, ''), NULLIF(v_user.raw_user_meta_data->>'phone_number', '')),
    CASE
      WHEN COALESCE(v_user.is_anonymous, false) THEN 'anonymous'
      WHEN NULLIF(v_user.phone, '') IS NOT NULL OR NULLIF(v_user.raw_user_meta_data->>'phone_number', '') IS NOT NULL THEN 'phone'
      ELSE 'email'
    END,
    public.generate_public_reference(),
    CASE
      WHEN COALESCE(v_user.is_anonymous, false) THEN NULL
      ELSE upper(NULLIF(v_user.raw_user_meta_data->>'referral_code', ''))
    END
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT referral_code INTO v_code
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;