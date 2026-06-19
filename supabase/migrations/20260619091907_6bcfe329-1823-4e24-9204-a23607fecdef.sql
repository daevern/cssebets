
CREATE OR REPLACE FUNCTION public.trust_platform_pulse()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'registered_members', (SELECT COUNT(*) FROM public.profiles WHERE is_simulation = false),
    'active_members_30d', (
      SELECT COUNT(DISTINCT p.user_id) FROM public.predictions p
      JOIN public.profiles pr ON pr.id = p.user_id AND pr.is_simulation = false
      WHERE p.created_at > now() - interval '30 days' AND p.is_simulation = false
    ),
    'bets_placed', (SELECT COUNT(*) FROM public.predictions WHERE is_simulation = false),
    'bets_settled', (SELECT COUNT(*) FROM public.predictions WHERE is_simulation = false AND status IN ('won','lost','void')),
    'approved_payouts', (SELECT COUNT(*) FROM public.payout_requests WHERE status = 'completed'),
    'total_points_paid_out', (SELECT COALESCE(SUM(amount),0)::numeric FROM public.payout_requests WHERE status = 'completed'),
    'avg_payout_processing_hours', (
      SELECT EXTRACT(EPOCH FROM AVG(completed_at - created_at)) / 3600.0
      FROM public.payout_requests WHERE status = 'completed' AND completed_at IS NOT NULL
    ),
    'avg_point_approval_hours', (
      SELECT EXTRACT(EPOCH FROM AVG(reviewed_at - COALESCE(submitted_at, requested_at))) / 3600.0
      FROM public.point_requests WHERE status = 'approved' AND reviewed_at IS NOT NULL
    ),
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.trust_platform_pulse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_platform_pulse() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_mask_name(name text, public_ref text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN name IS NULL OR length(trim(name)) < 2 THEN 'User #' || COALESCE(public_ref, '????')
    WHEN length(name) <= 3 THEN substr(name, 1, 1) || '**'
    ELSE substr(name, 1, 2) || '***' || substr(name, length(name), 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.trust_recent_activity()
RETURNS TABLE(kind text, who text, at timestamptz, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH events AS (
    SELECT 'bet_placed'::text AS kind, public.trust_mask_name(pr.display_name, pr.public_reference) AS who,
           p.created_at AS at, 'placed a bet'::text AS detail
    FROM public.predictions p JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.is_simulation = false AND pr.is_simulation = false
    UNION ALL
    SELECT 'bet_won', public.trust_mask_name(pr.display_name, pr.public_reference), p.settled_at, 'won a bet'
    FROM public.predictions p JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.status = 'won' AND p.is_simulation = false AND pr.is_simulation = false AND p.settled_at IS NOT NULL
    UNION ALL
    SELECT 'payout_requested', public.trust_mask_name(pr.display_name, pr.public_reference), pq.created_at, 'requested a payout'
    FROM public.payout_requests pq JOIN public.profiles pr ON pr.id = pq.user_id
    WHERE pr.is_simulation = false
    UNION ALL
    SELECT 'payout_completed', public.trust_mask_name(pr.display_name, pr.public_reference), pq.completed_at, 'received a payout'
    FROM public.payout_requests pq JOIN public.profiles pr ON pr.id = pq.user_id
    WHERE pq.status = 'completed' AND pq.completed_at IS NOT NULL AND pr.is_simulation = false
    UNION ALL
    SELECT 'points_approved', public.trust_mask_name(pr.display_name, pr.public_reference), ptr.reviewed_at, 'received approved points'
    FROM public.point_requests ptr JOIN public.profiles pr ON pr.id = ptr.user_id
    WHERE ptr.status = 'approved' AND ptr.reviewed_at IS NOT NULL AND ptr.is_simulation = false AND pr.is_simulation = false
  )
  SELECT kind, who, at, detail FROM events WHERE at IS NOT NULL ORDER BY at DESC LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.trust_recent_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_recent_activity() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_payout_performance()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH completed AS (
    SELECT amount, created_at, completed_at FROM public.payout_requests
    WHERE status = 'completed' AND completed_at IS NOT NULL
  ),
  total AS (
    SELECT COUNT(*) FILTER (WHERE status = 'completed') AS n_completed,
           COUNT(*) FILTER (WHERE status IN ('completed','rejected_by_admin','rejected_by_user')) AS n_finalized
    FROM public.payout_requests
  )
  SELECT jsonb_build_object(
    'avg_processing_hours', (SELECT EXTRACT(EPOCH FROM AVG(completed_at - created_at))/3600.0 FROM completed),
    'total_completed', (SELECT n_completed FROM total),
    'largest_completed', (SELECT MAX(amount)::numeric FROM completed),
    'success_rate', CASE WHEN (SELECT n_finalized FROM total) > 0
      THEN ((SELECT n_completed FROM total)::float / (SELECT n_finalized FROM total)) ELSE NULL END,
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.trust_payout_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_payout_performance() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_community_growth()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'members_this_month', (SELECT COUNT(*) FROM public.profiles WHERE is_simulation = false AND created_at >= date_trunc('month', now())),
    'bets_this_month', (SELECT COUNT(*) FROM public.predictions WHERE is_simulation = false AND created_at >= date_trunc('month', now())),
    'payouts_this_month', (SELECT COUNT(*) FROM public.payout_requests WHERE status = 'completed' AND completed_at >= date_trunc('month', now())),
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.trust_community_growth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_community_growth() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_platform_status()
RETURNS TABLE(service text, status text, last_checked timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH services(service) AS (
    VALUES ('Fixtures API'),('Odds Feed'),('Bet Settlement'),('Wallet System'),('Payout Processing'),('Support System')
  ),
  service_map AS (
    SELECT 'Fixtures API'::text AS service, ARRAY['fixtures_sync','fixtures','matches_sync']::text[] AS check_names
    UNION ALL SELECT 'Odds Feed', ARRAY['odds_sync','odds','odds_feed']
    UNION ALL SELECT 'Bet Settlement', ARRAY['settlement','settle','bet_settlement']
    UNION ALL SELECT 'Wallet System', ARRAY['wallet','wallets']
    UNION ALL SELECT 'Payout Processing', ARRAY['payouts','payout']
    UNION ALL SELECT 'Support System', ARRAY['support','support_system']
  ),
  latest AS (
    SELECT DISTINCT ON (h.check_name) h.check_name, h.status, h.created_at
    FROM public.health_check_runs h
    WHERE h.created_at > now() - interval '2 hours'
    ORDER BY h.check_name, h.created_at DESC
  ),
  per_service AS (
    SELECT sm.service,
      (SELECT l.status FROM latest l WHERE l.check_name = ANY (sm.check_names)
         ORDER BY CASE l.status WHEN 'failed' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END LIMIT 1) AS status,
      (SELECT MAX(l.created_at) FROM latest l WHERE l.check_name = ANY (sm.check_names)) AS last_checked
    FROM service_map sm
  )
  SELECT s.service,
    CASE COALESCE(ps.status, 'unknown')
      WHEN 'ok' THEN 'operational' WHEN 'degraded' THEN 'degraded'
      WHEN 'failed' THEN 'offline' ELSE 'unknown'
    END AS status,
    ps.last_checked
  FROM services s LEFT JOIN per_service ps USING (service);
$$;
REVOKE ALL ON FUNCTION public.trust_platform_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_platform_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_support_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH conv AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'open' AND claimed_by IS NULL) AS open,
      COUNT(*) FILTER (WHERE status = 'open' AND claimed_by IS NOT NULL) AS in_review,
      COUNT(*) FILTER (WHERE status = 'open' AND last_staff_message_at IS NOT NULL
                        AND (last_user_message_at IS NULL OR last_staff_message_at > last_user_message_at)) AS awaiting_user,
      COUNT(*) FILTER (WHERE status = 'closed') AS resolved
    FROM public.support_conversations
  ),
  resp AS (
    SELECT AVG(last_staff_message_at - last_user_message_at) AS avg_first
    FROM public.support_conversations
    WHERE last_staff_message_at IS NOT NULL AND last_user_message_at IS NOT NULL
      AND last_staff_message_at >= last_user_message_at
  )
  SELECT jsonb_build_object(
    'open', (SELECT open FROM conv), 'in_review', (SELECT in_review FROM conv),
    'awaiting_user', (SELECT awaiting_user FROM conv), 'resolved', (SELECT resolved FROM conv),
    'avg_first_response_hours', (SELECT EXTRACT(EPOCH FROM avg_first)/3600.0 FROM resp),
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.trust_support_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_support_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_my_badges(_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH stats AS (
    SELECT
      (SELECT COUNT(*) FROM public.predictions WHERE user_id = _user AND is_simulation = false) AS bets,
      (SELECT COUNT(*) FROM public.predictions WHERE user_id = _user AND status = 'won' AND is_simulation = false) AS wins,
      (SELECT COUNT(*) FROM public.payout_requests WHERE user_id = _user AND status = 'completed') AS payouts,
      (SELECT COUNT(*) > 0 FROM public.point_requests WHERE user_id = _user AND status = 'approved') AS has_approved_points
  )
  SELECT jsonb_build_object(
    'verified_member', (SELECT has_approved_points FROM stats),
    'first_bet', (SELECT bets >= 1 FROM stats),
    'ten_bets', (SELECT bets >= 10 FROM stats),
    'hundred_bets', (SELECT bets >= 100 FROM stats),
    'winning_streak', (SELECT wins >= 3 FROM stats),
    'payout_completed', (SELECT payouts >= 1 FROM stats),
    'bets', (SELECT bets FROM stats),
    'wins', (SELECT wins FROM stats),
    'payouts', (SELECT payouts FROM stats)
  );
$$;
REVOKE ALL ON FUNCTION public.trust_my_badges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_my_badges(uuid) TO authenticated;
