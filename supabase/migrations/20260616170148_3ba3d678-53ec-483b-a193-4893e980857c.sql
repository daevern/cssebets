
-- 1) match_market_odds: hide internal flags from clients (revoke column SELECT)
REVOKE SELECT (generated, source) ON public.match_market_odds FROM anon, authenticated;

-- 2) matches: hide pricing/risk internals from clients via column-level revoke
REVOKE SELECT (reference_odds, home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM anon, authenticated;

-- 3) matches: extend Admins manage matches policy to include super_admin
DROP POLICY IF EXISTS "Admins manage matches" ON public.matches;
CREATE POLICY "Admins manage matches"
  ON public.matches
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- 4) payout-proofs storage: scope UPDATE/DELETE to file owner's path
DROP POLICY IF EXISTS "users update own payout proofs" ON storage.objects;
CREATE POLICY "users update own payout proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payout-proofs'
    AND (storage.foldername(name))[1] = 'payouts'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'payout-proofs'
    AND (storage.foldername(name))[1] = 'payouts'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "users delete own payout proofs" ON storage.objects;
CREATE POLICY "users delete own payout proofs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payout-proofs'
    AND (storage.foldername(name))[1] = 'payouts'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
