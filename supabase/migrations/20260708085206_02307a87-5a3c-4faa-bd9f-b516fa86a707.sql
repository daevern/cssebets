
-- 1. Email tables: recreate policies scoped explicitly to service_role
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails
  FOR SELECT TO service_role USING (true);

-- 2. page_views: remove open anon/authenticated insert; only service role writes
DROP POLICY IF EXISTS "Anyone can record page views" ON public.page_views;
REVOKE INSERT, UPDATE, DELETE ON public.page_views FROM anon, authenticated;
GRANT INSERT ON public.page_views TO service_role;

-- 3. Public sports-data tables: revoke write privileges from anon/authenticated
--    (SELECT stays open; writes go through service_role/admin paths only)
REVOKE INSERT, UPDATE, DELETE ON
  public.match_events,
  public.match_stats,
  public.match_lineups,
  public.match_injuries,
  public.match_h2h,
  public.match_player_ratings,
  public.team_season_stats,
  public.tournaments,
  public.tournament_outrights
FROM anon, authenticated;
