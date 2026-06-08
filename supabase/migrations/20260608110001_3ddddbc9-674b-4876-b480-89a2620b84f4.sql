
-- Replace unqualified has_role(...) references in RLS policies with private.has_role(...)
DROP POLICY IF EXISTS "Members view leagues" ON public.leagues;
CREATE POLICY "Members view leagues" ON public.leagues
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'member'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members view league memberships" ON public.league_members;

DROP POLICY IF EXISTS "Members view all predictions" ON public.predictions;
CREATE POLICY "Members view all predictions" ON public.predictions
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'member'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members view matches" ON public.matches;
CREATE POLICY "Members view matches" ON public.matches
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'member'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "users read own wallet" ON public.wallets;
CREATE POLICY "users read own wallet" ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "users read own txns" ON public.wallet_transactions;
CREATE POLICY "users read own txns" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "read point requests" ON public.point_requests;
CREATE POLICY "read point requests" ON public.point_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- Drop the public has_role shadow now that nothing references it.
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Lock down SECURITY DEFINER functions: only service_role / postgres should EXECUTE.
REVOKE ALL ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_apply_change(uuid, wallet_txn_type, numeric, wallet_ref_type, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_approve_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_reject_request(uuid, uuid, text) FROM PUBLIC;
