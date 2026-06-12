
-- 1. Sequence for short reference IDs
CREATE SEQUENCE IF NOT EXISTS public.public_reference_seq START 1 INCREMENT 1 MINVALUE 1;

-- 2. Reference generator
CREATE OR REPLACE FUNCTION public.generate_public_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n bigint;
BEGIN
  v_n := nextval('public.public_reference_seq');
  RETURN 'CSSE' || lpad(v_n::text, 6, '0');
END $$;

-- 3. Add column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_reference text;

-- 4. Backfill existing rows
UPDATE public.profiles
   SET public_reference = public.generate_public_reference()
 WHERE public_reference IS NULL;

-- 5. Constraints
ALTER TABLE public.profiles
  ALTER COLUMN public_reference SET NOT NULL,
  ALTER COLUMN public_reference SET DEFAULT public.generate_public_reference();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_reference_key
  ON public.profiles (public_reference);

-- 6. Immutability trigger (cannot be updated after insert)
CREATE OR REPLACE FUNCTION public.prevent_public_reference_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
    RAISE EXCEPTION 'public_reference is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_public_reference_immutable ON public.profiles;
CREATE TRIGGER trg_profiles_public_reference_immutable
  BEFORE UPDATE OF public_reference ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_public_reference_update();

-- 7. Update handle_new_user to assign reference
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(COALESCE(NEW.email, ''), '@', 1),
      NULLIF(NEW.phone, '')
    ),
    NULLIF(NEW.phone, ''),
    CASE WHEN NEW.phone IS NOT NULL AND NEW.phone <> '' THEN 'phone' ELSE 'email' END,
    public.generate_public_reference()
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 8. Add column to point_requests
ALTER TABLE public.point_requests
  ADD COLUMN IF NOT EXISTS public_reference text;

-- 9. Auto-fill public_reference on insert from profiles (ignore client value)
CREATE OR REPLACE FUNCTION public.set_point_request_public_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT public_reference INTO NEW.public_reference
    FROM public.profiles WHERE id = NEW.user_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_point_requests_set_ref ON public.point_requests;
CREATE TRIGGER trg_point_requests_set_ref
  BEFORE INSERT OR UPDATE OF user_id ON public.point_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_point_request_public_reference();

-- 10. Backfill existing point_requests
UPDATE public.point_requests pr
   SET public_reference = p.public_reference
  FROM public.profiles p
 WHERE pr.user_id = p.id
   AND pr.public_reference IS NULL;

CREATE INDEX IF NOT EXISTS point_requests_public_reference_idx
  ON public.point_requests (public_reference);
