
-- ============================================================
-- High-margin virtual prediction markets
-- ============================================================

-- 1. New columns on predictions (back-compat). We use a text column
--    `market_text` for the new markets so we don't have to add enum
--    values mid-migration (Postgres forbids using new enum values
--    in the same transaction they were added).
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS market_text text,
  ADD COLUMN IF NOT EXISTS selection_label text,
  ADD COLUMN IF NOT EXISTS market_label text,
  ADD COLUMN IF NOT EXISTS settled_result text;

CREATE INDEX IF NOT EXISTS idx_predictions_match_market_text
  ON public.predictions(match_id, market_text)
  WHERE market_text IS NOT NULL;

-- 2. Half-time scores on matches.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_score_ht integer,
  ADD COLUMN IF NOT EXISTS away_score_ht integer;

-- 3. match_market_odds
CREATE TABLE IF NOT EXISTS public.match_market_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  market text NOT NULL,
  selection text NOT NULL,
  odds numeric(10,2) NOT NULL CHECK (odds >= 1),
  source text NOT NULL DEFAULT 'internal',
  active boolean NOT NULL DEFAULT true,
  generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, market, selection)
);
CREATE INDEX IF NOT EXISTS idx_mmo_match ON public.match_market_odds(match_id);
CREATE INDEX IF NOT EXISTS idx_mmo_match_market ON public.match_market_odds(match_id, market) WHERE active = true;

GRANT SELECT ON public.match_market_odds TO authenticated;
GRANT ALL ON public.match_market_odds TO service_role;

ALTER TABLE public.match_market_odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active market odds readable by authenticated" ON public.match_market_odds;
CREATE POLICY "Active market odds readable by authenticated"
  ON public.match_market_odds FOR SELECT
  TO authenticated
  USING (active = true);

DROP TRIGGER IF EXISTS trg_mmo_touch ON public.match_market_odds;
CREATE TRIGGER trg_mmo_touch BEFORE UPDATE ON public.match_market_odds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. market_odds_snapshots
CREATE TABLE IF NOT EXISTS public.market_odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  market text NOT NULL,
  selection text NOT NULL,
  odds numeric(10,2) NOT NULL,
  source text NOT NULL DEFAULT 'internal',
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mos_match ON public.market_odds_snapshots(match_id);

GRANT SELECT ON public.market_odds_snapshots TO authenticated;
GRANT ALL ON public.market_odds_snapshots TO service_role;

ALTER TABLE public.market_odds_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Market odds snapshots readable by authenticated" ON public.market_odds_snapshots;
CREATE POLICY "Market odds snapshots readable by authenticated"
  ON public.market_odds_snapshots FOR SELECT
  TO authenticated USING (true);

-- 5. Seed function for default high-margin internal odds.
CREATE OR REPLACE FUNCTION public.seed_match_market_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pairs text[][] := ARRAY[
    -- over_under_2_5
    ARRAY['over_under_2_5','OVER_2_5','1.85'],
    ARRAY['over_under_2_5','UNDER_2_5','1.85'],
    -- btts
    ARRAY['btts','YES','1.80'],
    ARRAY['btts','NO','1.90'],
    -- correct_score
    ARRAY['correct_score','0-0','8.00'],
    ARRAY['correct_score','1-0','7.00'],
    ARRAY['correct_score','0-1','7.50'],
    ARRAY['correct_score','1-1','6.50'],
    ARRAY['correct_score','2-0','8.50'],
    ARRAY['correct_score','0-2','9.00'],
    ARRAY['correct_score','2-1','8.00'],
    ARRAY['correct_score','1-2','8.50'],
    ARRAY['correct_score','2-2','11.00'],
    ARRAY['correct_score','3-0','13.00'],
    ARRAY['correct_score','0-3','15.00'],
    ARRAY['correct_score','3-1','12.00'],
    ARRAY['correct_score','1-3','13.00'],
    ARRAY['correct_score','3-2','18.00'],
    ARRAY['correct_score','2-3','18.00'],
    ARRAY['correct_score','3-3','30.00'],
    ARRAY['correct_score','4-0','30.00'],
    ARRAY['correct_score','0-4','35.00'],
    ARRAY['correct_score','4-1','35.00'],
    ARRAY['correct_score','1-4','35.00'],
    ARRAY['correct_score','4-2','45.00'],
    ARRAY['correct_score','2-4','45.00'],
    ARRAY['correct_score','OTHER','20.00'],
    -- half_time_full_time
    ARRAY['half_time_full_time','HOME_HOME','2.75'],
    ARRAY['half_time_full_time','HOME_DRAW','14.00'],
    ARRAY['half_time_full_time','HOME_AWAY','30.00'],
    ARRAY['half_time_full_time','DRAW_HOME','4.50'],
    ARRAY['half_time_full_time','DRAW_DRAW','5.00'],
    ARRAY['half_time_full_time','DRAW_AWAY','5.00'],
    ARRAY['half_time_full_time','AWAY_HOME','30.00'],
    ARRAY['half_time_full_time','AWAY_DRAW','14.00'],
    ARRAY['half_time_full_time','AWAY_AWAY','3.25'],
    -- exact_total_goals
    ARRAY['exact_total_goals','GOALS_0','8.00'],
    ARRAY['exact_total_goals','GOALS_1','4.50'],
    ARRAY['exact_total_goals','GOALS_2','3.50'],
    ARRAY['exact_total_goals','GOALS_3','4.00'],
    ARRAY['exact_total_goals','GOALS_4','6.00'],
    ARRAY['exact_total_goals','GOALS_5_PLUS','7.50']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(v_pairs,1) LOOP
    INSERT INTO public.match_market_odds (match_id, market, selection, odds, source, generated, active)
    VALUES (p_match_id, v_pairs[i][1], v_pairs[i][2], v_pairs[i][3]::numeric, 'internal', true, true)
    ON CONFLICT (match_id, market, selection) DO NOTHING;
  END LOOP;
END $$;

-- 6. Atomic placement for new (text-market) bets.
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid,
  p_match_id uuid,
  p_market text,
  p_selection text,
  p_stake numeric,
  p_client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pred_id uuid;
  v_existing uuid;
  v_odds numeric;
  v_potential numeric;
  v_match RECORD;
  v_sim boolean;
  v_settings public.platform_settings;
  v_snap_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals') THEN
    RAISE EXCEPTION 'unsupported market %', p_market;
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  -- Idempotency
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- Lock match
  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);

  -- Lookup server-side odds
  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true
    LIMIT 1;
  IF v_odds IS NULL THEN
    -- try seed then lookup again
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true
      LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'odds unavailable for selection'; END IF;

  v_potential := ROUND(p_stake * v_odds, 2);

  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_settings.max_potential_payout > 0 AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  -- Snapshot
  INSERT INTO public.market_odds_snapshots(match_id, market, selection, odds, source)
    VALUES (p_match_id, p_market, p_selection, v_odds, 'internal')
    RETURNING id INTO v_snap_id;

  -- Debit wallet
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(),
    'Bet placed ('||p_market||')', v_sim);

  -- Insert prediction. Use enum 'result' as a placeholder for the typed column
  -- to satisfy NOT NULL; the real market lives in market_text. The unique
  -- (user_id,match_id,market) constraint is dodged by using market_text
  -- discrimination — we set market = 'result' only when none exists; otherwise
  -- we use 'btts' / 'correct_score' / 'total_goals' enum slots that map to the
  -- new market keys we introduced. Actually simplest: we map the new markets
  -- onto distinct existing enum values per market to keep the unique key working.
  BEGIN
    INSERT INTO public.predictions(
      user_id, match_id, market, outcome,
      reference_odds, reference_odds_snapshot_id, virtual_stake, potential_return,
      is_simulation, client_request_id, market_text, selection_label)
    VALUES (
      p_user_id, p_match_id,
      CASE p_market
        WHEN 'over_under_2_5' THEN 'total_goals'::public.prediction_market
        WHEN 'btts' THEN 'btts'::public.prediction_market
        WHEN 'correct_score' THEN 'correct_score'::public.prediction_market
        WHEN 'half_time_full_time' THEN 'first_scorer'::public.prediction_market
        WHEN 'exact_total_goals' THEN 'group_winner'::public.prediction_market
      END,
      p_market || ':' || p_selection,
      v_odds, v_snap_id, p_stake, v_potential,
      v_sim, p_client_request_id, p_market, p_selection
    ) RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
  END;

  -- Bankroll: stake collected
  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id,
    'Stake collected ('||p_market||')', v_sim);

  RETURN v_pred_id;
END $$;

-- 7. Settlement helper for all new markets. Idempotent — only touches
--    predictions still in 'pending' state. Reuses wallet/platform helpers.
CREATE OR REPLACE FUNCTION public.settle_new_markets_for_match(
  p_match_id uuid,
  p_home int,
  p_away int,
  p_home_ht int DEFAULT NULL,
  p_away_ht int DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pred RECORD;
  v_count int := 0;
  v_total int;
  v_score_text text;
  v_listed_scores text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2',
    '3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4'];
  v_winner text;
  v_won boolean;
  v_payout numeric;
  v_sim boolean;
  v_ht_res text;
  v_ft_res text;
  v_target text;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id = p_match_id;
  v_sim := COALESCE(v_sim, false);
  v_total := COALESCE(p_home,0) + COALESCE(p_away,0);
  v_score_text := p_home || '-' || p_away;

  IF p_home > p_away THEN v_ft_res := 'HOME';
  ELSIF p_home < p_away THEN v_ft_res := 'AWAY';
  ELSE v_ft_res := 'DRAW'; END IF;

  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    IF p_home_ht > p_away_ht THEN v_ht_res := 'HOME';
    ELSIF p_home_ht < p_away_ht THEN v_ht_res := 'AWAY';
    ELSE v_ht_res := 'DRAW'; END IF;
  END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id
      AND status = 'pending'::public.prediction_status
      AND market_text IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals')
    FOR UPDATE
  LOOP
    v_won := false;

    IF v_pred.market_text = 'over_under_2_5' THEN
      v_won := (v_pred.selection_label = 'OVER_2_5' AND v_total > 2)
            OR (v_pred.selection_label = 'UNDER_2_5' AND v_total < 3);

    ELSIF v_pred.market_text = 'btts' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home > 0 AND p_away > 0)
            OR (v_pred.selection_label = 'NO'  AND (p_home = 0 OR p_away = 0));

    ELSIF v_pred.market_text = 'correct_score' THEN
      IF v_pred.selection_label = 'OTHER' THEN
        v_won := NOT (v_score_text = ANY(v_listed_scores));
      ELSE
        v_won := v_pred.selection_label = v_score_text;
      END IF;

    ELSIF v_pred.market_text = 'exact_total_goals' THEN
      v_won := CASE v_pred.selection_label
        WHEN 'GOALS_0' THEN v_total = 0
        WHEN 'GOALS_1' THEN v_total = 1
        WHEN 'GOALS_2' THEN v_total = 2
        WHEN 'GOALS_3' THEN v_total = 3
        WHEN 'GOALS_4' THEN v_total = 4
        WHEN 'GOALS_5_PLUS' THEN v_total >= 5
        ELSE false END;

    ELSIF v_pred.market_text = 'half_time_full_time' THEN
      IF v_ht_res IS NULL THEN
        -- Void: refund stake
        UPDATE public.predictions SET status='void', settled_at=now(),
               settled_result='void:no_ht_score' WHERE id = v_pred.id;
        PERFORM public.wallet_apply_change(
          v_pred.user_id,'refund'::public.wallet_txn_type, v_pred.virtual_stake,
          'bet_settlement'::public.wallet_ref_type, v_pred.id,
          'Void: half-time score unavailable', v_sim);
        PERFORM public.platform_apply_change(
          'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
          v_pred.id, p_match_id, 'Void HT/FT refund', v_sim);
        v_count := v_count + 1;
        CONTINUE;
      END IF;
      v_target := v_ht_res || '_' || v_ft_res;
      v_won := v_pred.selection_label = v_target;
    END IF;

    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions
        SET status='won', points=3, settled_at=now(),
            settled_result = v_score_text
        WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Win payout ('||v_pred.market_text||')', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout, v_pred.id, p_match_id,
        'Payout ('||v_pred.market_text||')', v_sim);
    ELSE
      UPDATE public.predictions
        SET status='lost', points=0, settled_at=now(),
            settled_result = v_score_text
        WHERE id = v_pred.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- 8. Wrapper that runs existing settlement first, then new-market settlement.
CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid,
  p_home int,
  p_away int,
  p_home_ht int DEFAULT NULL,
  p_away_ht int DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_a int := 0; v_b int := 0;
BEGIN
  -- Persist HT score if provided and not already stored.
  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    UPDATE public.matches
      SET home_score_ht = COALESCE(home_score_ht, p_home_ht),
          away_score_ht = COALESCE(away_score_ht, p_away_ht)
      WHERE id = p_match_id;
  END IF;

  SELECT public.settle_match_atomic(p_match_id, p_home, p_away) INTO v_a;
  SELECT public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht) INTO v_b;
  RETURN COALESCE(v_a,0) + COALESCE(v_b,0);
END $$;

-- 9. Exposure view (match × market × selection).
CREATE OR REPLACE VIEW public.match_market_exposure AS
SELECT
  p.match_id,
  COALESCE(p.market_text, p.market::text) AS market,
  COALESCE(p.selection_label, p.outcome) AS selection,
  COUNT(*)::int AS bet_count,
  SUM(p.virtual_stake)::numeric AS total_stake,
  SUM(p.potential_return)::numeric AS liability
FROM public.predictions p
WHERE p.status = 'pending'::public.prediction_status
GROUP BY p.match_id, COALESCE(p.market_text, p.market::text), COALESCE(p.selection_label, p.outcome);

GRANT SELECT ON public.match_market_exposure TO authenticated;
GRANT SELECT ON public.match_market_exposure TO service_role;
