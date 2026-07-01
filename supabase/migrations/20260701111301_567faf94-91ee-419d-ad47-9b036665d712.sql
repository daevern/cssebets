
-- =====================================================================
-- Phase 8: Correlated Exposure Alerts
-- =====================================================================

-- 1) TABLE ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.correlated_exposure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  correlation_group text NOT NULL,
  related_markets text[] NOT NULL DEFAULT '{}',
  related_outcomes text[] NOT NULL DEFAULT '{}',
  total_stake numeric NOT NULL DEFAULT 0,
  gross_payout numeric NOT NULL DEFAULT 0,
  net_liability numeric NOT NULL DEFAULT 0,
  bet_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','stale','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

-- Uniqueness so recalc can UPSERT (user_id may be NULL for match-level rows)
CREATE UNIQUE INDEX IF NOT EXISTS correlated_exposure_alerts_match_user_group_uidx
  ON public.correlated_exposure_alerts (match_id, correlation_group, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS correlated_exposure_alerts_match_id_idx  ON public.correlated_exposure_alerts(match_id);
CREATE INDEX IF NOT EXISTS correlated_exposure_alerts_user_id_idx   ON public.correlated_exposure_alerts(user_id);
CREATE INDEX IF NOT EXISTS correlated_exposure_alerts_status_idx    ON public.correlated_exposure_alerts(status);
CREATE INDEX IF NOT EXISTS correlated_exposure_alerts_severity_idx  ON public.correlated_exposure_alerts(severity);

GRANT SELECT ON public.correlated_exposure_alerts TO authenticated;
GRANT ALL    ON public.correlated_exposure_alerts TO service_role;

ALTER TABLE public.correlated_exposure_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read correlated alerts" ON public.correlated_exposure_alerts;
CREATE POLICY "Admins read correlated alerts"
  ON public.correlated_exposure_alerts
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'super_admin'::app_role)
  );
-- writes only via SECURITY DEFINER funcs / service_role

-- 2) CORRELATION-GROUP HELPER ----------------------------------------
-- Returns text[] of groups this bet belongs to.
CREATE OR REPLACE FUNCTION public._correlation_groups_for(
  p_market_text text,
  p_market      text,
  p_selection   text,
  p_outcome     text
) RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  mk    text := public._exposure_norm(COALESCE(NULLIF(p_market_text,''), p_market));
  sel   text := public._exposure_norm(COALESCE(NULLIF(p_selection,''), p_outcome));
  parts text[];
  hg    int; ag int;
  line  numeric;
  groups text[] := '{}';
BEGIN
  IF position(':' IN sel) > 0 THEN sel := split_part(sel,':',2); END IF;

  -- ---- match_result ----
  IF mk IN ('RESULT','MATCH_RESULT','1X2','FT_RESULT') THEN
    IF sel IN ('HOME','H','1')  THEN groups := groups || 'HOME_DOMINANCE'; END IF;
    IF sel IN ('AWAY','A','2')  THEN groups := groups || 'AWAY_DOMINANCE'; END IF;
    IF sel IN ('DRAW','X','D')  THEN groups := groups || 'LOW_SCORE_DRAW'; END IF;

  -- ---- double chance ----
  ELSIF mk IN ('DOUBLE_CHANCE','DC') THEN
    IF sel IN ('HOME_OR_DRAW','1X') THEN groups := groups || 'HOME_DOMINANCE' || 'LOW_SCORE_DRAW'; END IF;
    IF sel IN ('AWAY_OR_DRAW','X2') THEN groups := groups || 'AWAY_DOMINANCE' || 'LOW_SCORE_DRAW'; END IF;

  -- ---- draw no bet ----
  ELSIF mk IN ('DRAW_NO_BET','DNB') THEN
    IF sel IN ('HOME','H','1') THEN groups := groups || 'HOME_DOMINANCE'; END IF;
    IF sel IN ('AWAY','A','2') THEN groups := groups || 'AWAY_DOMINANCE'; END IF;

  -- ---- correct score ----
  ELSIF mk IN ('CORRECT_SCORE','CS') THEN
    parts := regexp_matches(sel, '^(\d+)[-_](\d+)$');
    IF parts IS NOT NULL THEN
      hg := parts[1]::int; ag := parts[2]::int;
      IF hg > ag THEN groups := groups || 'HOME_DOMINANCE'; END IF;
      IF ag > hg THEN groups := groups || 'AWAY_DOMINANCE'; END IF;
      IF hg = ag AND (hg + ag) <= 2 THEN groups := groups || 'LOW_SCORE_DRAW'; END IF;
      IF hg >= 1 AND ag >= 1 AND (hg + ag) >= 3 THEN groups := groups || 'HIGH_SCORE_BTTS'; END IF;
    END IF;

  -- ---- over/under totals ----
  ELSIF mk LIKE 'OVER_UNDER_%' THEN
    line := NULLIF(regexp_replace(mk, '^OVER_UNDER_(\d+)_(\d+)$', '\1.\2'), mk)::numeric;
    IF line IS NULL THEN
      line := NULLIF(regexp_replace(sel, '^(OVER|UNDER)_(\d+)_(\d+)$', '\2.\3'), sel)::numeric;
    END IF;
    IF sel LIKE 'OVER%'  AND line >= 2 THEN groups := groups || 'HIGH_SCORE_BTTS'; END IF;
    IF sel LIKE 'UNDER%' AND line <= 3 THEN groups := groups || 'LOW_SCORE_DRAW'; END IF;

  -- ---- BTTS ----
  ELSIF mk IN ('BTTS','BOTH_TEAMS_TO_SCORE') THEN
    IF sel IN ('YES','Y','TRUE') THEN groups := groups || 'HIGH_SCORE_BTTS'; END IF;
    IF sel IN ('NO','N','FALSE') THEN groups := groups || 'LOW_SCORE_DRAW'; END IF;

  -- ---- clean sheet / win to nil ----
  ELSIF mk = 'CLEAN_SHEET_HOME' AND sel IN ('YES','Y') THEN groups := groups || 'HOME_DOMINANCE';
  ELSIF mk = 'CLEAN_SHEET_AWAY' AND sel IN ('YES','Y') THEN groups := groups || 'AWAY_DOMINANCE';
  ELSIF mk = 'WIN_TO_NIL_HOME'  AND sel IN ('YES','Y') THEN groups := groups || 'HOME_DOMINANCE';
  ELSIF mk = 'WIN_TO_NIL_AWAY'  AND sel IN ('YES','Y') THEN groups := groups || 'AWAY_DOMINANCE';

  -- ---- corners ----
  ELSIF mk LIKE '%CORNER%' THEN
    IF sel LIKE 'OVER%' THEN groups := groups || 'CORNER_HEAVY'; END IF;
    IF mk LIKE 'HOME_CORNERS_%' AND sel LIKE 'OVER%' THEN groups := groups || 'HOME_DOMINANCE'; END IF;
    IF mk LIKE 'AWAY_CORNERS_%' AND sel LIKE 'OVER%' THEN groups := groups || 'AWAY_DOMINANCE'; END IF;

  -- ---- cards / red cards ----
  ELSIF mk LIKE '%CARD%' THEN
    IF sel LIKE 'OVER%' OR sel IN ('YES','Y','TRUE') THEN groups := groups || 'CARD_HEAVY'; END IF;
    IF mk LIKE 'HOME_CARDS_%' AND sel LIKE 'OVER%' THEN groups := groups || 'AWAY_DOMINANCE'; END IF;
    IF mk LIKE 'AWAY_CARDS_%' AND sel LIKE 'OVER%' THEN groups := groups || 'HOME_DOMINANCE'; END IF;

  END IF;

  -- unique
  SELECT ARRAY(SELECT DISTINCT unnest(groups)) INTO groups;
  RETURN groups;
END;
$$;

-- 3) SEVERITY HELPER --------------------------------------------------
CREATE OR REPLACE FUNCTION public._live_bankroll()
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT balance FROM public.platform_bankroll
      WHERE kind = 'live' AND is_active = true
      ORDER BY id LIMIT 1),
    (SELECT balance FROM public.platform_bankroll WHERE id = 1),
    100000::numeric
  );
$$;

-- 4) RECALC FUNCTION --------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_correlated_exposure(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bankroll numeric := public._live_bankroll();
  inserted_ids uuid[] := '{}';
  agg RECORD;
  sev text;
  alert_id uuid;
BEGIN
  -- Expand pending bets to (group, bet) rows using the helper
  WITH pending AS (
    SELECT p.id, p.user_id, p.match_id, p.market::text AS market, p.market_text,
           p.selection_label, p.outcome, p.virtual_stake, p.reference_odds, p.potential_return,
           COALESCE(NULLIF(p.market_text,''), p.market::text) AS market_display
    FROM public.predictions p
    WHERE p.match_id = p_match_id
      AND p.status = 'pending'
      AND p.is_simulation = false
  ),
  expanded AS (
    SELECT pen.*,
           unnest(public._correlation_groups_for(pen.market_text, pen.market, pen.selection_label, pen.outcome)) AS grp
    FROM pending pen
  ),
  -- Match-level aggregates (user_id = NULL)
  match_lvl AS (
    SELECT match_id, NULL::uuid AS user_id, grp AS correlation_group,
           SUM(virtual_stake) AS total_stake,
           SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds)) AS gross_payout,
           SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds) - virtual_stake) AS net_liability,
           COUNT(*) AS bet_count,
           array_agg(id) AS bet_ids,
           array_agg(DISTINCT market_display) AS related_markets,
           array_agg(DISTINCT COALESCE(NULLIF(selection_label,''), outcome)) AS related_outcomes
    FROM expanded GROUP BY match_id, grp
  ),
  user_lvl AS (
    SELECT match_id, user_id, grp AS correlation_group,
           SUM(virtual_stake) AS total_stake,
           SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds)) AS gross_payout,
           SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds) - virtual_stake) AS net_liability,
           COUNT(*) AS bet_count,
           array_agg(id) AS bet_ids,
           array_agg(DISTINCT market_display) AS related_markets,
           array_agg(DISTINCT COALESCE(NULLIF(selection_label,''), outcome)) AS related_outcomes
    FROM expanded GROUP BY match_id, user_id, grp
  )
  SELECT * INTO agg FROM (SELECT 1) t; -- placeholder for compile

  -- Insert / update alerts (match-level + user-level)
  FOR agg IN
    SELECT * FROM (
      WITH pending AS (
        SELECT p.id, p.user_id, p.match_id, p.market::text AS market, p.market_text,
               p.selection_label, p.outcome, p.virtual_stake, p.reference_odds, p.potential_return,
               COALESCE(NULLIF(p.market_text,''), p.market::text) AS market_display
        FROM public.predictions p
        WHERE p.match_id = p_match_id AND p.status='pending' AND p.is_simulation=false
      ),
      expanded AS (
        SELECT pen.*,
               unnest(public._correlation_groups_for(pen.market_text, pen.market, pen.selection_label, pen.outcome)) AS grp
        FROM pending pen
      )
      SELECT match_id, NULL::uuid AS user_id, grp AS correlation_group,
             SUM(virtual_stake) AS total_stake,
             SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds)) AS gross_payout,
             SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds) - virtual_stake) AS net_liability,
             COUNT(*)::int AS bet_count,
             array_agg(id) AS bet_ids,
             array_agg(DISTINCT market_display) AS related_markets,
             array_agg(DISTINCT COALESCE(NULLIF(selection_label,''), outcome)) AS related_outcomes
      FROM expanded GROUP BY match_id, grp
      UNION ALL
      SELECT match_id, user_id, grp,
             SUM(virtual_stake),
             SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds)),
             SUM(COALESCE(NULLIF(potential_return,0), virtual_stake * reference_odds) - virtual_stake),
             COUNT(*)::int,
             array_agg(id),
             array_agg(DISTINCT market_display),
             array_agg(DISTINCT COALESCE(NULLIF(selection_label,''), outcome))
      FROM expanded GROUP BY match_id, user_id, grp
    ) x
  LOOP
    -- severity
    sev := 'medium';
    IF bankroll > 0 THEN
      IF agg.net_liability >= bankroll * 0.20 OR agg.net_liability > bankroll THEN sev := 'critical';
      ELSIF agg.net_liability >= bankroll * 0.10 THEN sev := 'high';
      ELSIF agg.net_liability >= bankroll * 0.05 THEN sev := 'medium';
      ELSE
        -- low-volume mode: only alert for user stacks of >=3
        IF agg.user_id IS NOT NULL AND agg.bet_count >= 3 THEN
          sev := 'medium';
        ELSE
          CONTINUE;  -- skip creating this alert
        END IF;
      END IF;
    END IF;

    INSERT INTO public.correlated_exposure_alerts
      (match_id, user_id, severity, correlation_group,
       related_markets, related_outcomes, total_stake, gross_payout, net_liability,
       bet_ids, status, updated_at)
    VALUES
      (agg.match_id, agg.user_id, sev, agg.correlation_group,
       agg.related_markets, agg.related_outcomes,
       agg.total_stake, agg.gross_payout, agg.net_liability,
       agg.bet_ids, 'open', now())
    ON CONFLICT (match_id, correlation_group, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      severity          = EXCLUDED.severity,
      related_markets   = EXCLUDED.related_markets,
      related_outcomes  = EXCLUDED.related_outcomes,
      total_stake       = EXCLUDED.total_stake,
      gross_payout      = EXCLUDED.gross_payout,
      net_liability     = EXCLUDED.net_liability,
      bet_ids           = EXCLUDED.bet_ids,
      -- do NOT reopen resolved/dismissed alerts unless liability jumps materially
      status            = CASE
        WHEN public.correlated_exposure_alerts.status IN ('resolved','dismissed')
             AND EXCLUDED.net_liability <= public.correlated_exposure_alerts.net_liability * 1.25
          THEN public.correlated_exposure_alerts.status
        ELSE 'open'
      END,
      updated_at        = now()
    RETURNING id INTO alert_id;

    inserted_ids := inserted_ids || alert_id;
  END LOOP;

  -- Mark any prior open alerts for this match that we did NOT touch as 'stale'
  UPDATE public.correlated_exposure_alerts
     SET status='stale', updated_at = now()
   WHERE match_id = p_match_id
     AND status = 'open'
     AND NOT (id = ANY(inserted_ids));

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'alerts_upserted', array_length(inserted_ids,1),
    'live_bankroll', bankroll,
    'calculated_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'match_id', p_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_correlated_exposure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_correlated_exposure(uuid) TO authenticated, service_role;

-- 5) ADMIN READ RPC ---------------------------------------------------
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
           COALESCE(pr.display_name, pr.username, u.email) AS user_label,
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

-- 6) RESOLVE RPC ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_correlated_exposure_alert(
  p_alert_id uuid, p_resolution_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  r RECORD;
BEGIN
  SELECT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) INTO is_admin;
  IF NOT COALESCE(is_admin,false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.correlated_exposure_alerts
     SET status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = p_resolution_note,
         updated_at = now()
   WHERE id = p_alert_id
   RETURNING * INTO r;

  IF r.id IS NULL THEN RAISE EXCEPTION 'Alert not found'; END IF;

  -- Best-effort audit log
  BEGIN
    PERFORM public.create_audit_log(
      'correlated_exposure.resolved',
      'correlated_exposure_alert',
      r.id::text,
      NULL::jsonb,
      jsonb_build_object('resolution_note', p_resolution_note, 'severity', r.severity, 'group', r.correlation_group)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'id', r.id, 'status', r.status);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_correlated_exposure_alert(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_correlated_exposure_alert(uuid,text) TO authenticated, service_role;

-- 7) MARK-STALE TRIGGER ON PREDICTIONS -------------------------------
CREATE OR REPLACE FUNCTION public._predictions_mark_correlated_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.correlated_exposure_alerts
       SET status = CASE WHEN status = 'open' THEN 'stale' ELSE status END,
           updated_at = now()
     WHERE match_id = COALESCE(NEW.match_id, OLD.match_id)
       AND status = 'open';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_predictions_mark_correlated_stale ON public.predictions;
CREATE TRIGGER trg_predictions_mark_correlated_stale
AFTER INSERT OR UPDATE OF status, virtual_stake, reference_odds, potential_return
ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public._predictions_mark_correlated_stale();
