CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage leagues" ON public.leagues;
CREATE POLICY "Admins can manage leagues" ON public.leagues FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Members view league membership" ON public.league_members;
CREATE POLICY "Members view league membership" ON public.league_members FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'member') OR private.has_role(auth.uid(),'admin')
);

DROP POLICY IF EXISTS "Admins manage matches" ON public.matches;
CREATE POLICY "Admins manage matches" ON public.matches FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Users view own predictions" ON public.predictions;
CREATE POLICY "Users view own predictions" ON public.predictions FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR private.has_role(auth.uid(),'admin')
);

DROP POLICY IF EXISTS "Users insert own pending predictions" ON public.predictions;
CREATE POLICY "Users insert own pending predictions" ON public.predictions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (private.has_role(auth.uid(),'member') OR private.has_role(auth.uid(),'admin'))
);

DROP POLICY IF EXISTS "Admins view all audit" ON public.audit_log;
CREATE POLICY "Admins view all audit" ON public.audit_log FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;