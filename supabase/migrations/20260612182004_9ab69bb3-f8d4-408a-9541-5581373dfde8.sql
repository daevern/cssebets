
-- 1. Restrict profiles SELECT to own row (admins/staff already have access via service-role server fns)
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR private.has_staff_role(auth.uid()));

-- 2. Revoke SELECT on liability/exposure columns from authenticated so member/admin browser clients cannot read them.
--    Server-side code uses supabaseAdmin (service_role) which bypasses these grants.
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM authenticated;
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM anon;

-- 3. Add DELETE policies for support-attachments bucket
DROP POLICY IF EXISTS "support attach: user deletes own" ON storage.objects;
CREATE POLICY "support attach: user deletes own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "support attach: staff delete any" ON storage.objects;
CREATE POLICY "support attach: staff delete any"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND private.has_staff_role(auth.uid())
  );
