REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM authenticated;

GRANT SELECT (
  id, external_id, stage, group_name, home_team, away_team,
  home_crest, away_crest, kickoff_at, status, home_score, away_score,
  winner, reference_odds, created_at, updated_at
) ON public.matches TO authenticated;

DROP POLICY IF EXISTS "users create own pending payout" ON public.payout_requests;
CREATE POLICY "users create own pending payout" ON public.payout_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND approved_at IS NULL
    AND proof_file_path IS NULL
    AND proof_file_name IS NULL
    AND proof_file_type IS NULL
    AND proof_file_size IS NULL
    AND proof_uploaded_at IS NULL
  );

DROP POLICY IF EXISTS "users decide on own proof" ON public.payout_requests;
CREATE POLICY "users decide on own proof" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'proof_uploaded')
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('completed','rejected_by_user')
  );