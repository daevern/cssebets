
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS old_value jsonb;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS user_agent text;

CREATE TABLE IF NOT EXISTS public.admin_reauth (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  two_factor_placeholder boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.admin_reauth TO authenticated;
GRANT ALL ON public.admin_reauth TO service_role;
ALTER TABLE public.admin_reauth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own reauth" ON public.admin_reauth;
CREATE POLICY "users read own reauth" ON public.admin_reauth
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION private.has_any_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin','viewer')
  )
$$;
REVOKE EXECUTE ON FUNCTION private.has_any_admin_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_any_admin_role(uuid) TO authenticated;
