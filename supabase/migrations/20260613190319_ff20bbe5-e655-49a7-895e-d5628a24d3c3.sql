
-- 1) Tighten payout_requests user UPDATE: only allow user to reject, not to set 'completed'
DROP POLICY IF EXISTS "users decide on own proof" ON public.payout_requests;
CREATE POLICY "users decide on own proof"
  ON public.payout_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'proof_uploaded'::payout_request_status)
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'rejected_by_user'::payout_request_status
  );

-- 2) Explicit deny-all policies on rate_limits (RLS already enabled; service_role bypasses RLS)
CREATE POLICY "rate_limits deny select" ON public.rate_limits FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "rate_limits deny insert" ON public.rate_limits FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "rate_limits deny update" ON public.rate_limits FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "rate_limits deny delete" ON public.rate_limits FOR DELETE TO authenticated, anon USING (false);
