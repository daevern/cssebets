
-- 1. Restrict financial liability columns on matches: revoke at column level
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure) ON public.matches FROM authenticated;
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure) ON public.matches FROM anon;
-- service_role retains full access (bypasses RLS) for admin server functions

-- 2. Restrict market_odds_snapshots reads to admins only (align with match_odds_snapshots policy)
DROP POLICY IF EXISTS "Market odds snapshots readable by authenticated" ON public.market_odds_snapshots;
CREATE POLICY "Admins view market odds snapshots"
  ON public.market_odds_snapshots
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 3. Restrict profile SELECT to owner only. Staff/admin access continues
--    via server functions using the service-role client (which bypasses RLS),
--    so admin tools keep working while compromised admin tokens can no longer
--    bulk-read phone numbers via the Data API.
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
