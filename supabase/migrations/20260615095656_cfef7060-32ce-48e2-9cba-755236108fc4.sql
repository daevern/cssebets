
-- Tighten league_members SELECT: users may only see their own memberships, plus admins
DROP POLICY IF EXISTS "Members view league membership" ON public.league_members;
CREATE POLICY "Users view own league memberships"
ON public.league_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

-- Restrict match_stake_pools SELECT to admins only (internal financial aggregates)
DROP POLICY IF EXISTS "members read pools" ON public.match_stake_pools;
CREATE POLICY "admins read pools"
ON public.match_stake_pools FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));
