-- 1) Remove overly permissive predictions read policy.
DROP POLICY IF EXISTS "Members view all predictions" ON public.predictions;

-- 2) Hide profiles.suspended from regular authenticated users.
-- Admins access via service-role server functions, which bypass column grants.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;