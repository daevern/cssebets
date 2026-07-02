GRANT SELECT ON public.match_odds_snapshots TO authenticated;
GRANT SELECT ON public.market_odds_snapshots TO authenticated;

CREATE POLICY "Signed-in users can view match odds snapshots"
ON public.match_odds_snapshots
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Signed-in users can view market odds snapshots"
ON public.market_odds_snapshots
FOR SELECT
TO authenticated
USING (true);