
-- 1. Set search_path on email queue helper functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pgmq, public
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pgmq, public
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pgmq, public
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pgmq, public
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- 2. Restrict match-detail tables to authenticated users only (was open to anon)
DROP POLICY IF EXISTS "events readable" ON public.match_events;
CREATE POLICY "events readable" ON public.match_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "h2h readable" ON public.match_h2h;
CREATE POLICY "h2h readable" ON public.match_h2h FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "injuries readable" ON public.match_injuries;
CREATE POLICY "injuries readable" ON public.match_injuries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lineups readable" ON public.match_lineups;
CREATE POLICY "lineups readable" ON public.match_lineups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ratings readable" ON public.match_player_ratings;
CREATE POLICY "ratings readable" ON public.match_player_ratings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stats readable" ON public.match_stats;
CREATE POLICY "stats readable" ON public.match_stats FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team stats readable" ON public.team_season_stats;
CREATE POLICY "team stats readable" ON public.team_season_stats FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tournament odds readable" ON public.tournament_outrights;
CREATE POLICY "tournament odds readable" ON public.tournament_outrights FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tournaments readable" ON public.tournaments;
CREATE POLICY "tournaments readable" ON public.tournaments FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.match_events, public.match_h2h, public.match_injuries, public.match_lineups, public.match_player_ratings, public.match_stats, public.team_season_stats, public.tournament_outrights, public.tournaments FROM anon;
