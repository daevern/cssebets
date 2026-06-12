
-- 1. Properly hide liability columns: revoke table-level SELECT then grant column-level SELECT
--    on every non-sensitive column. Service-role keeps full access via the existing GRANT ALL.
REVOKE SELECT ON public.matches FROM authenticated, anon;

GRANT SELECT (
  id, external_id, stage, group_name,
  home_team, away_team, home_crest, away_crest,
  kickoff_at, status, home_score, away_score,
  home_score_ht, away_score_ht, winner,
  reference_odds, odds_updated_at, odds_source,
  is_simulation, created_at, updated_at
) ON public.matches TO authenticated;

GRANT SELECT (
  id, external_id, stage, group_name,
  home_team, away_team, home_crest, away_crest,
  kickoff_at, status, home_score, away_score,
  home_score_ht, away_score_ht, winner,
  reference_odds, odds_updated_at, odds_source,
  is_simulation, created_at, updated_at
) ON public.matches TO anon;

-- 2. realtime.messages: only allow authenticated subscribers, and only to postgres_changes
--    (broadcast/presence topics blocked). Source-table RLS still filters rows per user.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated may receive postgres_changes" ON realtime.messages;
CREATE POLICY "authenticated may receive postgres_changes"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (extension = 'postgres_changes');

-- 3. payout-proofs: allow users to upload into their own folder (payouts/<auth.uid()>/...).
DROP POLICY IF EXISTS "users upload own payout proofs" ON storage.objects;
CREATE POLICY "users upload own payout proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payout-proofs'
    AND (storage.foldername(name))[1] = 'payouts'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
