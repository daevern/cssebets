
-- 1. Remove unused snapshot tables from Realtime publication (no member consumers)
ALTER PUBLICATION supabase_realtime DROP TABLE public.market_odds_snapshots;
ALTER PUBLICATION supabase_realtime DROP TABLE public.match_odds_snapshots;

-- 2. Restrict sports_feature_flags SELECT to authenticated only
DROP POLICY IF EXISTS "sports_flags_read_all" ON public.sports_feature_flags;
CREATE POLICY "sports_flags_read_authenticated"
  ON public.sports_feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Restrict UFC public-read tables to authenticated only (consistent with other sports tables)
DROP POLICY IF EXISTS "ufc_events public read" ON public.ufc_events;
CREATE POLICY "ufc_events authenticated read"
  ON public.ufc_events
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ufc_fights public read" ON public.ufc_fights;
CREATE POLICY "ufc_fights authenticated read"
  ON public.ufc_fights
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ufc_fight_markets public read" ON public.ufc_fight_markets;
CREATE POLICY "ufc_fight_markets authenticated read"
  ON public.ufc_fight_markets
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ufc_snapshots public read" ON public.ufc_market_snapshots;
CREATE POLICY "ufc_market_snapshots authenticated read"
  ON public.ufc_market_snapshots
  FOR SELECT
  TO authenticated
  USING (true);
