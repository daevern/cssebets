
-- Helper: pick a realistic (home, away) score for a simulation match
-- based on the match's reference_odds (implied probabilities).
CREATE OR REPLACE FUNCTION public.pick_odds_weighted_score(p_match_id uuid)
RETURNS TABLE(home_score int, away_score int, outcome text, outcome_prob numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_odds jsonb;
  v_ho numeric; v_do numeric; v_ao numeric;
  v_hp numeric; v_dp numeric; v_ap numeric; v_total numeric;
  v_r numeric;
  v_outcome text;
  v_prob numeric;
  v_scores int[][];
  v_weights numeric[];
  v_pick int;
  v_w_sum numeric;
  v_cum numeric;
  v_i int;
  v_home int; v_away int;
BEGIN
  SELECT reference_odds INTO v_odds FROM public.matches WHERE id = p_match_id;
  v_ho := COALESCE(NULLIF((v_odds->>'home')::numeric, 0), 2.0);
  v_do := COALESCE(NULLIF((v_odds->>'draw')::numeric, 0), 3.2);
  v_ao := COALESCE(NULLIF((v_odds->>'away')::numeric, 0), 3.5);

  v_hp := 1.0 / v_ho;
  v_dp := 1.0 / v_do;
  v_ap := 1.0 / v_ao;
  v_total := v_hp + v_dp + v_ap;
  v_hp := v_hp / v_total;
  v_dp := v_dp / v_total;
  v_ap := v_ap / v_total;

  v_r := random();
  IF v_r < v_hp THEN
    v_outcome := 'HOME'; v_prob := v_hp;
  ELSIF v_r < v_hp + v_dp THEN
    v_outcome := 'DRAW'; v_prob := v_dp;
  ELSE
    v_outcome := 'AWAY'; v_prob := v_ap;
  END IF;

  -- Weighted score templates per outcome
  IF v_outcome = 'HOME' THEN
    v_scores := ARRAY[[1,0],[2,0],[2,1],[3,0],[3,1],[3,2],[4,0],[4,1],[4,2],[5,1],[5,2],[6,1]];
    v_weights := ARRAY[22,18,18,10,10,7,5,4,2,2,1,1]::numeric[];
  ELSIF v_outcome = 'AWAY' THEN
    v_scores := ARRAY[[0,1],[0,2],[1,2],[0,3],[1,3],[2,3],[0,4],[1,4],[2,4],[1,5],[2,5],[1,6]];
    v_weights := ARRAY[22,18,18,10,10,7,5,4,2,2,1,1]::numeric[];
  ELSE
    v_scores := ARRAY[[0,0],[1,1],[2,2],[3,3]];
    v_weights := ARRAY[28,42,22,8]::numeric[];
  END IF;

  v_w_sum := 0;
  FOREACH v_pick IN ARRAY v_weights LOOP v_w_sum := v_w_sum + v_pick; END LOOP;
  v_r := random() * v_w_sum;
  v_cum := 0;
  v_i := 1;
  FOREACH v_pick IN ARRAY v_weights LOOP
    v_cum := v_cum + v_pick;
    IF v_r <= v_cum THEN EXIT; END IF;
    v_i := v_i + 1;
  END LOOP;
  IF v_i > array_length(v_weights,1) THEN v_i := array_length(v_weights,1); END IF;

  v_home := v_scores[v_i][1];
  v_away := v_scores[v_i][2];

  home_score := v_home;
  away_score := v_away;
  outcome := v_outcome;
  outcome_prob := v_prob;
  RETURN NEXT;
END;
$$;

-- Update batch settle to use odds-weighted outcomes
CREATE OR REPLACE FUNCTION public.run_simulation_batch_settle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_started_count INT := 0;
  v_settled_count INT := 0;
  v_total_preds INT := 0;
  v_home INT; v_away INT; v_preds INT;
  v_outcome TEXT; v_prob NUMERIC;
  v_t0 TIMESTAMPTZ := clock_timestamp();
  v_duration_ms NUMERIC;
  v_score RECORD;
BEGIN
  FOR v_match IN
    SELECT id FROM public.matches
     WHERE is_simulation = true AND status = 'scheduled'::public.match_status
     FOR UPDATE
  LOOP
    UPDATE public.matches
       SET status = 'live'::public.match_status,
           kickoff_at = LEAST(kickoff_at, now())
     WHERE id = v_match.id;
    v_started_count := v_started_count + 1;
  END LOOP;

  FOR v_match IN
    SELECT id FROM public.matches
     WHERE is_simulation = true AND status = 'live'::public.match_status
     FOR UPDATE
  LOOP
    SELECT * INTO v_score FROM public.pick_odds_weighted_score(v_match.id);
    SELECT public.settle_match_atomic(v_match.id, v_score.home_score, v_score.away_score) INTO v_preds;
    v_settled_count := v_settled_count + 1;
    v_total_preds := v_total_preds + COALESCE(v_preds, 0);
  END LOOP;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000;

  RETURN jsonb_build_object(
    'started', v_started_count,
    'settled', v_settled_count,
    'predictions_settled', v_total_preds,
    'duration_ms', v_duration_ms,
    'avg_ms_per_match', CASE WHEN v_settled_count > 0 THEN v_duration_ms / v_settled_count ELSE 0 END,
    'at', now()
  );
END $$;

-- Update tick to use odds-weighted outcomes too
CREATE OR REPLACE FUNCTION public.run_simulation_tick(p_match_duration_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD; v_started INT := 0; v_settled INT := 0; v_settle_count INT;
  v_score RECORD;
BEGIN
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE is_simulation = true AND status='scheduled'::public.match_status AND kickoff_at <= now()
    FOR UPDATE
  LOOP
    UPDATE public.matches SET status='live'::public.match_status WHERE id=v_match.id;
    v_started := v_started + 1;
  END LOOP;

  FOR v_match IN
    SELECT id FROM public.matches
    WHERE is_simulation = true AND status='live'::public.match_status
      AND kickoff_at + (p_match_duration_minutes || ' minutes')::interval <= now()
    FOR UPDATE
  LOOP
    SELECT * INTO v_score FROM public.pick_odds_weighted_score(v_match.id);
    SELECT public.settle_match_atomic(v_match.id, v_score.home_score, v_score.away_score) INTO v_settle_count;
    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object('started', v_started, 'settled', v_settled, 'at', now());
END $$;

-- Analytics: outcome distribution, average margin, surprise stats for finished sim matches
CREATE OR REPLACE FUNCTION public.get_simulation_outcome_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_fav int := 0; v_draw int := 0; v_dog int := 0;
  v_exp_fav numeric := 0; v_exp_draw numeric := 0; v_exp_dog numeric := 0;
  v_avg_margin numeric := 0; v_min_margin numeric; v_max_margin numeric;
  v_sum_surprise numeric := 0; v_max_surprise numeric := 0;
  m RECORD;
  ho numeric; dr numeric; ao numeric;
  hp numeric; dp numeric; ap numeric; tot numeric;
  fav_p numeric; dog_p numeric;
  actual text; actual_p numeric;
  margin numeric;
BEGIN
  FOR m IN
    SELECT reference_odds, home_score, away_score
    FROM public.matches
    WHERE is_simulation = true AND status = 'finished'::public.match_status
      AND reference_odds IS NOT NULL
  LOOP
    ho := NULLIF((m.reference_odds->>'home')::numeric,0);
    dr := NULLIF((m.reference_odds->>'draw')::numeric,0);
    ao := NULLIF((m.reference_odds->>'away')::numeric,0);
    IF ho IS NULL OR dr IS NULL OR ao IS NULL THEN CONTINUE; END IF;
    hp := 1.0/ho; dp := 1.0/dr; ap := 1.0/ao;
    tot := hp+dp+ap;
    margin := (tot - 1) * 100;
    hp := hp/tot; dp := dp/tot; ap := ap/tot;
    fav_p := GREATEST(hp, ap);
    dog_p := LEAST(hp, ap);

    v_total := v_total + 1;
    v_avg_margin := v_avg_margin + margin;
    IF v_min_margin IS NULL OR margin < v_min_margin THEN v_min_margin := margin; END IF;
    IF v_max_margin IS NULL OR margin > v_max_margin THEN v_max_margin := margin; END IF;
    v_exp_fav := v_exp_fav + fav_p;
    v_exp_draw := v_exp_draw + dp;
    v_exp_dog := v_exp_dog + dog_p;

    IF m.home_score > m.away_score THEN
      actual := 'HOME'; actual_p := hp;
    ELSIF m.home_score < m.away_score THEN
      actual := 'AWAY'; actual_p := ap;
    ELSE
      actual := 'DRAW'; actual_p := dp;
    END IF;

    IF actual = 'DRAW' THEN
      v_draw := v_draw + 1;
    ELSIF (actual='HOME' AND hp >= ap) OR (actual='AWAY' AND ap > hp) THEN
      v_fav := v_fav + 1;
    ELSE
      v_dog := v_dog + 1;
    END IF;

    IF actual_p > 0 THEN
      v_sum_surprise := v_sum_surprise + (1.0/actual_p);
      IF (1.0/actual_p) > v_max_surprise THEN v_max_surprise := 1.0/actual_p; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matches_finished', v_total,
    'favorite_wins_pct', CASE WHEN v_total>0 THEN v_fav*100.0/v_total ELSE 0 END,
    'draws_pct', CASE WHEN v_total>0 THEN v_draw*100.0/v_total ELSE 0 END,
    'underdog_wins_pct', CASE WHEN v_total>0 THEN v_dog*100.0/v_total ELSE 0 END,
    'expected_favorite_pct', CASE WHEN v_total>0 THEN v_exp_fav*100.0/v_total ELSE 0 END,
    'expected_draw_pct', CASE WHEN v_total>0 THEN v_exp_draw*100.0/v_total ELSE 0 END,
    'expected_underdog_pct', CASE WHEN v_total>0 THEN v_exp_dog*100.0/v_total ELSE 0 END,
    'avg_house_margin_pct', CASE WHEN v_total>0 THEN v_avg_margin/v_total ELSE 0 END,
    'min_house_margin_pct', COALESCE(v_min_margin, 0),
    'max_house_margin_pct', COALESCE(v_max_margin, 0),
    'avg_surprise_index', CASE WHEN v_total>0 THEN v_sum_surprise/v_total ELSE 0 END,
    'max_surprise_index', v_max_surprise
  );
END $$;
