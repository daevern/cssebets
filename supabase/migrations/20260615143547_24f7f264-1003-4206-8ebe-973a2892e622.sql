-- Restrict member access to internal financial/odds-snapshot columns on matches.
-- These fields are used only by admin/server flows (via service role) and should
-- not be readable by regular authenticated users.
REVOKE SELECT (worst_case_exposure, home_liability, draw_liability, away_liability, reference_odds)
  ON public.matches FROM authenticated;
REVOKE SELECT (worst_case_exposure, home_liability, draw_liability, away_liability, reference_odds)
  ON public.matches FROM anon;

-- Allow admins and super_admins to read all profiles via RLS so legitimate
-- admin tooling does not need to rely on service-role bypass.
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );
