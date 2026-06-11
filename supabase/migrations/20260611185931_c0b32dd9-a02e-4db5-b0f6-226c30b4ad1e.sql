DROP POLICY IF EXISTS "Members view matches" ON public.matches;
CREATE POLICY "Members view matches" ON public.matches
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'member'::app_role)
      AND COALESCE(is_simulation, false) = false
    )
  );