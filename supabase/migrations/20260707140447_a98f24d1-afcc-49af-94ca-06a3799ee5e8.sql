CREATE OR REPLACE FUNCTION public.get_correlated_exposure_alerts(p_status text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  result jsonb;
BEGIN
  SELECT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) INTO is_admin;
  IF NOT COALESCE(is_admin,false) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY (x.severity_rank) DESC, x.updated_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT a.id, a.match_id,
           (m.home_team || ' vs ' || m.away_team) AS match_label,
           a.user_id,
           COALESCE(pr.display_name, u.email) AS user_label,
           a.severity,
           CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3
             WHEN 'medium' THEN 2 ELSE 1 END AS severity_rank,
           a.correlation_group,
           a.related_markets, a.related_outcomes,
           a.total_stake, a.gross_payout, a.net_liability,
           array_length(a.bet_ids, 1) AS bet_count,
           a.status, a.created_at, a.updated_at,
           a.resolved_at, a.resolution_note
    FROM public.correlated_exposure_alerts a
    LEFT JOIN public.matches  m  ON m.id = a.match_id
    LEFT JOIN public.profiles pr ON pr.id = a.user_id
    LEFT JOIN auth.users      u  ON u.id  = a.user_id
    WHERE (p_status IS NULL OR p_status = 'all' OR a.status = p_status)
  ) x;

  RETURN jsonb_build_object('alerts', COALESCE(result, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_correlated_exposure_alerts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_correlated_exposure_alerts(text) TO authenticated, service_role;