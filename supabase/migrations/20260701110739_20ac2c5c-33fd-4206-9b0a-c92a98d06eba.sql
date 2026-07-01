
-- =====================================================================
-- Phase 7: Scenario-Based Worst-Case Exposure Engine
-- =====================================================================

-- 1) TABLE ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_exposure_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  scenario_key text NOT NULL,
  scenario_label text NOT NULL,
  home_goals integer,
  away_goals integer,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,

  gross_payout numeric NOT NULL DEFAULT 0,
  net_liability numeric NOT NULL DEFAULT 0,
  total_stake_involved numeric NOT NULL DEFAULT 0,
  winning_bet_count integer NOT NULL DEFAULT 0,
  contributing_bet_ids uuid[] NOT NULL DEFAULT '{}',

  exposure_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,

  calculated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (match_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS match_exposure_scenarios_match_id_idx
  ON public.match_exposure_scenarios(match_id);
CREATE INDEX IF NOT EXISTS match_exposure_scenarios_net_liability_idx
  ON public.match_exposure_scenarios(net_liability DESC);
CREATE INDEX IF NOT EXISTS match_exposure_scenarios_calculated_at_idx
  ON public.match_exposure_scenarios(calculated_at DESC);

GRANT SELECT ON public.match_exposure_scenarios TO authenticated;
GRANT ALL ON public.match_exposure_scenarios TO service_role;

ALTER TABLE public.match_exposure_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read exposure scenarios" ON public.match_exposure_scenarios;
CREATE POLICY "Admins read exposure scenarios"
  ON public.match_exposure_scenarios
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- No INSERT/UPDATE/DELETE policies -> only service_role / SECURITY DEFINER funcs can write.

-- 2) MATCH COLUMNS ----------------------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS worst_case_gross_payout numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_case_net_liability numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_case_scenario_key text,
  ADD COLUMN IF NOT EXISTS worst_case_scenario_label text,
  ADD COLUMN IF NOT EXISTS exposure_last_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS exposure_is_stale boolean NOT NULL DEFAULT true;

-- 3) OUTCOME NORMALIZATION HELPER ------------------------------------
CREATE OR REPLACE FUNCTION public._exposure_norm(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN txt IS NULL THEN ''
    ELSE upper(regexp_replace(regexp_replace(txt, '\s+', '_', 'g'), '[^A-Za-z0-9_\-\.:]', '', 'g'))
  END;
$$;

-- 4) BET-WINS-UNDER-SCENARIO HELPER ----------------------------------
-- Returns TRUE if the given pending bet would settle as a WIN given the scoreline.
-- Returns NULL for markets we cannot evaluate from scoreline (stat-dependent).
CREATE OR REPLACE FUNCTION public._exposure_bet_wins(
  p_market_text text,
  p_market      text,
  p_selection   text,
  p_outcome     text,
  p_home        integer,
  p_away        integer
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  mk    text := public._exposure_norm(COALESCE(NULLIF(p_market_text,''), p_market));
  sel   text := public._exposure_norm(COALESCE(NULLIF(p_selection,''), p_outcome));
  total integer := p_home + p_away;
  line  numeric;
  n     integer;
  parts text[];
  hg    integer;
  ag    integer;
BEGIN
  -- strip common "market:selection" prefix if present
  IF position(':' IN sel) > 0 THEN
    sel := split_part(sel, ':', 2);
  END IF;

  -- ---- MATCH RESULT / 1X2 ----
  IF mk IN ('RESULT','MATCH_RESULT','1X2','FT_RESULT') THEN
    RETURN (sel IN ('HOME','H','1')      AND p_home > p_away)
        OR (sel IN ('DRAW','X','D')      AND p_home = p_away)
        OR (sel IN ('AWAY','A','2')      AND p_away > p_home);

  -- ---- DOUBLE CHANCE ----
  ELSIF mk IN ('DOUBLE_CHANCE','DC') THEN
    RETURN (sel IN ('HOME_OR_DRAW','1X','HOMEDRAW') AND p_home >= p_away)
        OR (sel IN ('AWAY_OR_DRAW','X2','DRAWAWAY') AND p_away >= p_home)
        OR (sel IN ('HOME_OR_AWAY','12','HOMEAWAY') AND p_home <> p_away);

  -- ---- DRAW NO BET ---- (draw = void, not a win)
  ELSIF mk IN ('DRAW_NO_BET','DNB') THEN
    IF p_home = p_away THEN RETURN false; END IF;
    RETURN (sel IN ('HOME','H','1') AND p_home > p_away)
        OR (sel IN ('AWAY','A','2') AND p_away > p_home);

  -- ---- OVER / UNDER TOTAL GOALS ----
  ELSIF mk LIKE 'OVER_UNDER_%' OR mk LIKE 'TOTAL_GOALS_%' THEN
    line := NULLIF(regexp_replace(mk, '^[A-Z_]*?(\d+)_(\d+)$', '\1.\2'), mk)::numeric;
    IF line IS NULL THEN
      -- try selection like OVER_2_5
      line := NULLIF(regexp_replace(sel, '^(OVER|UNDER)_(\d+)_(\d+)$', '\2.\3'), sel)::numeric;
    END IF;
    IF line IS NULL THEN RETURN NULL; END IF;
    IF sel LIKE 'OVER%'  THEN RETURN total::numeric > line; END IF;
    IF sel LIKE 'UNDER%' THEN RETURN total::numeric < line; END IF;
    RETURN NULL;

  -- ---- BTTS ----
  ELSIF mk IN ('BTTS','BOTH_TEAMS_TO_SCORE') THEN
    IF sel IN ('YES','Y','TRUE') THEN RETURN p_home >= 1 AND p_away >= 1; END IF;
    IF sel IN ('NO','N','FALSE') THEN RETURN p_home = 0 OR p_away = 0; END IF;
    RETURN NULL;

  -- ---- CORRECT SCORE ----
  ELSIF mk IN ('CORRECT_SCORE','CS') THEN
    IF sel = 'OTHER' THEN
      -- OTHER wins if scoreline is not one of the explicitly offered ones
      RETURN NOT (
        (p_home BETWEEN 0 AND 4) AND (p_away BETWEEN 0 AND 4)
      );
    END IF;
    parts := regexp_matches(sel, '^(\d+)[-_](\d+)$');
    IF parts IS NULL THEN RETURN NULL; END IF;
    hg := parts[1]::int; ag := parts[2]::int;
    RETURN hg = p_home AND ag = p_away;

  -- ---- GOALS ODD/EVEN ----
  ELSIF mk IN ('GOALS_ODD_EVEN','ODD_EVEN') THEN
    IF sel = 'ODD'  THEN RETURN (total % 2) = 1; END IF;
    IF sel = 'EVEN' THEN RETURN (total % 2) = 0; END IF;
    RETURN NULL;

  -- ---- EXACT TOTAL GOALS ----
  ELSIF mk IN ('EXACT_TOTAL_GOALS','EXACT_GOALS') THEN
    IF sel LIKE 'GOALS_%_PLUS' THEN
      n := regexp_replace(sel, '^GOALS_(\d+)_PLUS$', '\1')::int;
      RETURN total >= n;
    END IF;
    IF sel LIKE 'GOALS_%' THEN
      n := regexp_replace(sel, '^GOALS_(\d+)$', '\1')::int;
      RETURN total = n;
    END IF;
    IF sel ~ '^\d+$' THEN RETURN total = sel::int; END IF;
    RETURN NULL;

  -- ---- CLEAN SHEET ----
  ELSIF mk IN ('CLEAN_SHEET_HOME') THEN
    IF sel IN ('YES','Y') THEN RETURN p_away = 0; END IF;
    IF sel IN ('NO','N')  THEN RETURN p_away > 0; END IF;
    RETURN NULL;
  ELSIF mk IN ('CLEAN_SHEET_AWAY') THEN
    IF sel IN ('YES','Y') THEN RETURN p_home = 0; END IF;
    IF sel IN ('NO','N')  THEN RETURN p_home > 0; END IF;
    RETURN NULL;

  -- ---- WIN TO NIL ----
  ELSIF mk IN ('WIN_TO_NIL_HOME') THEN
    IF sel IN ('YES','Y') THEN RETURN p_home > p_away AND p_away = 0; END IF;
    IF sel IN ('NO','N')  THEN RETURN NOT (p_home > p_away AND p_away = 0); END IF;
    RETURN NULL;
  ELSIF mk IN ('WIN_TO_NIL_AWAY') THEN
    IF sel IN ('YES','Y') THEN RETURN p_away > p_home AND p_home = 0; END IF;
    IF sel IN ('NO','N')  THEN RETURN NOT (p_away > p_home AND p_home = 0); END IF;
    RETURN NULL;

  -- ---- TO QUALIFY (approximate from 90-min scoreline: NULL = unknown) ----
  ELSIF mk IN ('TO_QUALIFY','QUALIFY','ADVANCE') THEN
    RETURN NULL;
  END IF;

  -- Unsupported / stat-dependent -> NULL
  RETURN NULL;
END;
$$;

-- 5) MAIN RECALC FUNCTION -------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_match_scenario_exposure(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_scen  RECORD;
  r_bet   RECORD;
  scenarios jsonb := jsonb_build_array(
    -- (key, label, home, away, assumptions)
    jsonb_build_object('k','0-0','l','0-0','h',0,'a',0,'as','{}'::jsonb),
    jsonb_build_object('k','1-0','l','1-0','h',1,'a',0,'as','{}'::jsonb),
    jsonb_build_object('k','0-1','l','0-1','h',0,'a',1,'as','{}'::jsonb),
    jsonb_build_object('k','1-1','l','1-1','h',1,'a',1,'as','{}'::jsonb),
    jsonb_build_object('k','2-0','l','2-0','h',2,'a',0,'as','{}'::jsonb),
    jsonb_build_object('k','0-2','l','0-2','h',0,'a',2,'as','{}'::jsonb),
    jsonb_build_object('k','2-1','l','2-1','h',2,'a',1,'as','{}'::jsonb),
    jsonb_build_object('k','1-2','l','1-2','h',1,'a',2,'as','{}'::jsonb),
    jsonb_build_object('k','2-2','l','2-2','h',2,'a',2,'as','{}'::jsonb),
    jsonb_build_object('k','3-0','l','3-0','h',3,'a',0,'as','{}'::jsonb),
    jsonb_build_object('k','0-3','l','0-3','h',0,'a',3,'as','{}'::jsonb),
    jsonb_build_object('k','3-1','l','3-1','h',3,'a',1,'as','{}'::jsonb),
    jsonb_build_object('k','1-3','l','1-3','h',1,'a',3,'as','{}'::jsonb),
    jsonb_build_object('k','3-2','l','3-2','h',3,'a',2,'as','{}'::jsonb),
    jsonb_build_object('k','2-3','l','2-3','h',2,'a',3,'as','{}'::jsonb),
    jsonb_build_object('k','3-3','l','3-3','h',3,'a',3,'as','{}'::jsonb),
    jsonb_build_object('k','4-0','l','4-0','h',4,'a',0,'as','{}'::jsonb),
    jsonb_build_object('k','0-4','l','0-4','h',0,'a',4,'as','{}'::jsonb),
    jsonb_build_object('k','4-1','l','4-1','h',4,'a',1,'as','{}'::jsonb),
    jsonb_build_object('k','1-4','l','1-4','h',1,'a',4,'as','{}'::jsonb),
    jsonb_build_object('k','4-2','l','4-2','h',4,'a',2,'as','{}'::jsonb),
    jsonb_build_object('k','2-4','l','2-4','h',2,'a',4,'as','{}'::jsonb),
    jsonb_build_object('k','4-3','l','4-3','h',4,'a',3,'as','{}'::jsonb),
    jsonb_build_object('k','3-4','l','3-4','h',3,'a',4,'as','{}'::jsonb),
    jsonb_build_object('k','OTHER_HOME_BIG_WIN','l','Home big win (5-0)','h',5,'a',0,'as',jsonb_build_object('note','Represents any large home win >4 goal margin')),
    jsonb_build_object('k','OTHER_AWAY_BIG_WIN','l','Away big win (0-5)','h',0,'a',5,'as',jsonb_build_object('note','Represents any large away win >4 goal margin')),
    jsonb_build_object('k','OTHER_HIGH_DRAW','l','High draw (4-4)','h',4,'a',4,'as',jsonb_build_object('note','Represents any high-scoring draw'))
  );
  s          jsonb;
  wins       boolean;
  gross      numeric;
  net        numeric;
  bet_ids    uuid[];
  win_count  int;
  stake_sum  numeric;
  gross_sum  numeric;
  worst_key  text;
  worst_lbl  text;
  worst_gross numeric := 0;
  worst_net  numeric := 0;
  stat_breakdown jsonb := '{}'::jsonb;
  scen_summary jsonb := '[]'::jsonb;
  pending_count int := 0;
  pending_stake numeric := 0;
BEGIN
  -- Wipe old scenario rows for this match
  DELETE FROM public.match_exposure_scenarios WHERE match_id = p_match_id;

  -- Aggregate pending stake / count
  SELECT COUNT(*), COALESCE(SUM(virtual_stake),0)
    INTO pending_count, pending_stake
  FROM public.predictions
  WHERE match_id = p_match_id AND status = 'pending' AND is_simulation = false;

  -- Build stat-dependent (non-scoreline) exposure breakdown
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO stat_breakdown
  FROM (
    SELECT
      COALESCE(NULLIF(p.market_text,''), p.market::text) AS market,
      COALESCE(NULLIF(p.selection_label,''), p.outcome)  AS selection,
      COUNT(*)                                            AS bet_count,
      COALESCE(SUM(p.virtual_stake),0)                    AS total_stake,
      COALESCE(SUM(CASE
        WHEN p.potential_return IS NOT NULL AND p.potential_return > 0 THEN p.potential_return
        ELSE p.virtual_stake * p.reference_odds
      END),0) AS gross_exposure,
      COALESCE(SUM(CASE
        WHEN p.potential_return IS NOT NULL AND p.potential_return > 0 THEN p.potential_return
        ELSE p.virtual_stake * p.reference_odds
      END - p.virtual_stake),0) AS net_liability
    FROM public.predictions p
    LEFT JOIN public.market_rules mr
      ON mr.market_key = COALESCE(NULLIF(p.market_text,''), p.market::text)
      OR COALESCE(NULLIF(p.market_text,''), p.market::text) = ANY(mr.market_aliases)
    WHERE p.match_id = p_match_id
      AND p.status = 'pending'
      AND p.is_simulation = false
      AND (mr.is_stat_dependent = true
           OR mr.is_scoreline_dependent = false
           OR mr.market_key IS NULL AND COALESCE(NULLIF(p.market_text,''), p.market::text) ~* '(card|corner)')
    GROUP BY 1,2
  ) t;

  -- Iterate scenarios
  FOR s IN SELECT * FROM jsonb_array_elements(scenarios) LOOP
    gross_sum := 0; stake_sum := 0; win_count := 0; bet_ids := '{}'::uuid[];

    FOR r_bet IN
      SELECT id, market::text AS market, market_text, outcome, selection_label,
             virtual_stake, reference_odds, potential_return
      FROM public.predictions
      WHERE match_id = p_match_id AND status = 'pending' AND is_simulation = false
    LOOP
      wins := public._exposure_bet_wins(
        r_bet.market_text, r_bet.market, r_bet.selection_label, r_bet.outcome,
        (s->>'h')::int, (s->>'a')::int
      );
      IF wins IS TRUE THEN
        gross := COALESCE(NULLIF(r_bet.potential_return,0), r_bet.virtual_stake * r_bet.reference_odds);
        gross_sum := gross_sum + gross;
        stake_sum := stake_sum + r_bet.virtual_stake;
        win_count := win_count + 1;
        bet_ids := bet_ids || r_bet.id;
      END IF;
    END LOOP;

    net := gross_sum - stake_sum;

    INSERT INTO public.match_exposure_scenarios
      (match_id, scenario_key, scenario_label, home_goals, away_goals, assumptions,
       gross_payout, net_liability, total_stake_involved, winning_bet_count,
       contributing_bet_ids, exposure_breakdown)
    VALUES
      (p_match_id, s->>'k', s->>'l', (s->>'h')::int, (s->>'a')::int, COALESCE(s->'as','{}'::jsonb),
       gross_sum, net, stake_sum, win_count,
       bet_ids, jsonb_build_object('stat_market_exposure', stat_breakdown));

    scen_summary := scen_summary || jsonb_build_object(
      'scenario_key', s->>'k',
      'scenario_label', s->>'l',
      'gross_payout', gross_sum,
      'net_liability', net,
      'winning_bet_count', win_count
    );

    IF net > worst_net OR worst_key IS NULL THEN
      worst_net := net; worst_gross := gross_sum;
      worst_key := s->>'k'; worst_lbl := s->>'l';
    END IF;
  END LOOP;

  -- Update match snapshot
  UPDATE public.matches
     SET worst_case_gross_payout      = worst_gross,
         worst_case_net_liability     = worst_net,
         worst_case_scenario_key      = worst_key,
         worst_case_scenario_label    = worst_lbl,
         exposure_last_calculated_at  = now(),
         exposure_is_stale            = false
   WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'pending_bet_count', pending_count,
    'open_pending_stake', pending_stake,
    'worst_case_scenario_key', worst_key,
    'worst_case_scenario_label', worst_lbl,
    'worst_case_gross_payout', worst_gross,
    'worst_case_net_liability', worst_net,
    'scoreline_scenarios', scen_summary,
    'stat_market_exposure', stat_breakdown,
    'calculated_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Never break callers; mark stale and re-raise as JSON warning
  UPDATE public.matches SET exposure_is_stale = true WHERE id = p_match_id;
  RETURN jsonb_build_object('error', SQLERRM, 'match_id', p_match_id, 'exposure_is_stale', true);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_match_scenario_exposure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_match_scenario_exposure(uuid) TO authenticated, service_role;

-- 6) ADMIN READ RPC --------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_match_exposure_summary(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  m RECORD;
  scen jsonb;
  stat jsonb;
  pending_count int;
  pending_stake numeric;
BEGIN
  SELECT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) INTO is_admin;
  IF NOT COALESCE(is_admin,false) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT worst_case_scenario_key, worst_case_scenario_label,
         worst_case_gross_payout, worst_case_net_liability,
         exposure_last_calculated_at, exposure_is_stale
    INTO m
  FROM public.matches WHERE id = p_match_id;

  SELECT COUNT(*), COALESCE(SUM(virtual_stake),0)
    INTO pending_count, pending_stake
  FROM public.predictions
  WHERE match_id = p_match_id AND status='pending' AND is_simulation=false;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY (x.net_liability) DESC), '[]'::jsonb)
    INTO scen
  FROM (
    SELECT scenario_key, scenario_label, home_goals, away_goals,
           gross_payout, net_liability, total_stake_involved, winning_bet_count
    FROM public.match_exposure_scenarios
    WHERE match_id = p_match_id
  ) x;

  SELECT COALESCE(exposure_breakdown->'stat_market_exposure','[]'::jsonb)
    INTO stat
  FROM public.match_exposure_scenarios
  WHERE match_id = p_match_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'worst_case_scenario_key', m.worst_case_scenario_key,
    'worst_case_scenario_label', m.worst_case_scenario_label,
    'worst_case_gross_payout', COALESCE(m.worst_case_gross_payout,0),
    'worst_case_net_liability', COALESCE(m.worst_case_net_liability,0),
    'open_pending_stake', pending_stake,
    'pending_bet_count', pending_count,
    'scoreline_scenarios', COALESCE(scen,'[]'::jsonb),
    'stat_market_exposure', COALESCE(stat,'[]'::jsonb),
    'exposure_last_calculated_at', m.exposure_last_calculated_at,
    'exposure_is_stale', COALESCE(m.exposure_is_stale,true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_exposure_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_exposure_summary(uuid) TO authenticated, service_role;

-- 7) MARK-STALE TRIGGER ON PREDICTIONS -------------------------------
-- Safer than modifying place_market_bet_atomic. Fires after any insert/status change.
CREATE OR REPLACE FUNCTION public._predictions_mark_exposure_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.matches
       SET exposure_is_stale = true
     WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never break bet placement/settlement
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_predictions_mark_exposure_stale ON public.predictions;
CREATE TRIGGER trg_predictions_mark_exposure_stale
AFTER INSERT OR UPDATE OF status, virtual_stake, reference_odds, potential_return
ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public._predictions_mark_exposure_stale();

-- 8) BACKFILL: mark all matches with pending bets as stale ----------
UPDATE public.matches m
   SET exposure_is_stale = true
 WHERE EXISTS (
   SELECT 1 FROM public.predictions p
    WHERE p.match_id = m.id AND p.status='pending' AND p.is_simulation=false
 );
