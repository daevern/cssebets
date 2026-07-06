
DROP POLICY IF EXISTS "Active market odds readable by authenticated" ON public.match_market_odds;

CREATE POLICY "Active market odds readable by authenticated"
ON public.match_market_odds
FOR SELECT
TO authenticated
USING (
  active = true
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_market_odds.match_id
        AND COALESCE(m.is_simulation, false) = false
    )
  )
);
