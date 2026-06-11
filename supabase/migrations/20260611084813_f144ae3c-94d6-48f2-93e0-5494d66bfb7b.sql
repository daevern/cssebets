
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;

CREATE POLICY "Admins can read odds snapshots"
ON public.match_odds_snapshots
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));
