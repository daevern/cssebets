DROP POLICY IF EXISTS bj_score_bal_read ON public.arcade_bj_score_balances;
CREATE POLICY bj_score_bal_read ON public.arcade_bj_score_balances
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);