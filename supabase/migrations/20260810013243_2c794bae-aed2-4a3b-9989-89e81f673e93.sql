GRANT SELECT ON public.sports_feature_flags TO anon;
DROP POLICY IF EXISTS sports_flags_read_public ON public.sports_feature_flags;
CREATE POLICY sports_flags_read_public ON public.sports_feature_flags FOR SELECT TO anon USING (true);