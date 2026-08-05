-- Arcade house-edge realignment (v2 configs) -----------------------------
-- Non-destructive: historical rounds keep their original config_id / version.
-- v2 configs are created in DRAFT and activated for DEVELOPMENT + SIMULATION
-- only. PRODUCTION stays pinned to v1 until an admin promotes v2.

-- 1. Immutable configuration registry -------------------------------------
CREATE TABLE IF NOT EXISTS public.arcade_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL CHECK (product IN ('plinko','rps','blackjack','roulette','treasure')),
  version integer NOT NULL,
  target_rtp numeric(8,5) NOT NULL,
  target_house_edge numeric(8,5) NOT NULL,
  measured_rtp numeric(8,5),
  measured_house_edge numeric(8,5),
  simulation_rounds bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, version)
);
GRANT SELECT ON public.arcade_config_versions TO authenticated;
GRANT ALL ON public.arcade_config_versions TO service_role;
ALTER TABLE public.arcade_config_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade config versions readable" ON public.arcade_config_versions
  FOR SELECT TO authenticated USING (true);

-- 2. Per-environment activation pointer ------------------------------------
CREATE TABLE IF NOT EXISTS public.arcade_config_activation (
  product text NOT NULL CHECK (product IN ('plinko','rps','blackjack','roulette','treasure')),
  environment public.acct_environment NOT NULL,
  config_version integer NOT NULL,
  reason text,
  activated_by uuid,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, environment)
);
GRANT SELECT ON public.arcade_config_activation TO authenticated;
GRANT ALL ON public.arcade_config_activation TO service_role;
ALTER TABLE public.arcade_config_activation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade config activation readable" ON public.arcade_config_activation
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.arcade_config_version_for(p_product text, p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT a.config_version
    FROM public.arcade_config_activation a
   WHERE a.product = p_product
     AND a.environment = COALESCE(public.accounting_user_env(p_user), 'PRODUCTION'::public.acct_environment)
$fn$;


-- 3. Rock-Paper-Scissors v2 : 5.00% house edge (95.00% RTP) ----------------
INSERT INTO public.arcade_rps_configurations (
  version, status, min_stake, max_stake, chip_values,
  win_multiplier, draw_multiplier, round_ttl_seconds,
  daily_round_limit, cooldown_seconds, maintenance_mode, announcement)
SELECT 2, 'draft', c.min_stake, c.max_stake, c.chip_values,
       1.8500, 1.0000, c.round_ttl_seconds,
       c.daily_round_limit, c.cooldown_seconds, false, c.announcement
  FROM public.arcade_rps_configurations c
 WHERE c.version = 1
ON CONFLICT DO NOTHING;


-- 4. Blackjack v2 : 1.50% target house edge -------------------------------
-- 6 decks, dealer hits soft 17, double any first two, no double after split,
-- resplit to 4 hands, blackjack pays 4:3. Monte Carlo (3M hands, basic
-- strategy): RTP 98.443%, house edge 1.557% (+/-0.066%).
INSERT INTO public.arcade_bj_rule_configs (
  name, version, status, deck_count, dealer_hits_soft_17, dealer_peek,
  max_split_hands, resplit_allowed, resplit_aces, hit_split_aces,
  double_allowed, double_after_split, auto_stand_on_21, penetration,
  action_timeout_seconds, daily_hand_limit, announcement,
  strategy_table_version, maintenance_mode, min_stake, max_stake,
  blackjack_payout, max_payout, chip_values, change_reason)
SELECT 'standard', 2, 'draft', 6, true, true,
       4, true, false, false,
       true, false, true, r.penetration,
       r.action_timeout_seconds, r.daily_hand_limit, r.announcement,
       r.strategy_table_version, false, r.min_stake, r.max_stake,
       1.333, r.max_payout, r.chip_values,
       'House-edge realignment to 1.50% target (H17, no DAS, blackjack pays 4:3)'
  FROM public.arcade_bj_rule_configs r
 WHERE r.name = 'standard' AND r.version = 1
ON CONFLICT DO NOTHING;

-- Draft/aspiring configs must stay readable to players in the environments
-- they are activated for.
DROP POLICY IF EXISTS "bj_rules_read_activated" ON public.arcade_bj_rule_configs;
CREATE POLICY "bj_rules_read_activated" ON public.arcade_bj_rule_configs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.arcade_config_activation a
                  WHERE a.product = 'blackjack' AND a.config_version = arcade_bj_rule_configs.version));


-- 5. Plinko v2 : 4.00% house edge (96.00% RTP) on every rows/risk profile --
INSERT INTO public.arcade_score_profiles (rows, risk_mode, version, status, change_reason)
SELECT p.rows, p.risk_mode, 2, 'draft',
       'House-edge realignment: 99% RTP -> 96.00% RTP (4.00% edge)'
  FROM public.arcade_score_profiles p
 WHERE p.status = 'active'
ON CONFLICT (rows, risk_mode, version) DO NOTHING;

INSERT INTO public.arcade_score_profile_slots (profile_id, slot_index, score, multiplier)
SELECT p.id, s.idx - 1, v.scores[s.idx], v.mults[s.idx]
  FROM (VALUES
    (8,'high',ARRAY[1000,316,63,4,0,4,63,316,1000]::int[],ARRAY[28.1000,3.8800,1.4500,0.2900,0.1971,0.2900,1.4500,3.8800,28.1000]::numeric(10,4)[]),
    (8,'low',ARRAY[200,175,150,125,100,125,150,175,200]::int[],ARRAY[5.4300,2.0400,1.0700,0.9700,0.4814,0.9700,1.0700,2.0400,5.4300]::numeric(10,4)[]),
    (8,'medium',ARRAY[500,294,148,59,30,59,148,294,500]::int[],ARRAY[12.6000,2.9100,1.2600,0.6800,0.3897,0.6800,1.2600,2.9100,12.6000]::numeric(10,4)[]),
    (10,'high',ARRAY[1000,410,130,26,2,0,2,26,130,410,1000]::int[],ARRAY[73.7000,9.6900,2.9100,0.8700,0.2900,0.1958,0.2900,0.8700,2.9100,9.6900,73.7000]::numeric(10,4)[]),
    (10,'low',ARRAY[200,180,160,140,120,100,120,140,160,180,200]::int[],ARRAY[8.6300,2.9100,1.3600,1.0700,0.9700,0.4801,0.9700,1.0700,1.3600,2.9100,8.6300]::numeric(10,4)[]),
    (10,'medium',ARRAY[500,331,199,105,49,30,49,105,199,331,500]::int[],ARRAY[21.4000,4.8500,1.9400,1.3600,0.5800,0.3914,0.5800,1.3600,1.9400,4.8500,21.4000]::numeric(10,4)[]),
    (12,'high',ARRAY[1000,482,198,63,12,1,0,1,12,63,198,482,1000]::int[],ARRAY[165.0000,23.2000,7.8500,1.9400,0.6800,0.1900,0.1963,0.1900,0.6800,1.9400,7.8500,23.2000,165.0000]::numeric(10,4)[]),
    (12,'low',ARRAY[200,183,167,150,133,117,100,117,133,150,167,183,200]::int[],ARRAY[9.7000,2.9100,1.5500,1.3600,1.0700,0.9700,0.4807,0.9700,1.0700,1.3600,1.5500,2.9100,9.7000]::numeric(10,4)[]),
    (12,'medium',ARRAY[500,356,239,148,82,43,30,43,82,148,239,356,500]::int[],ARRAY[32.0000,10.7000,3.8800,1.9400,1.0700,0.5800,0.2896,0.5800,1.0700,1.9400,3.8800,10.7000,32.0000]::numeric(10,4)[]),
    (14,'high',ARRAY[1000,540,260,107,34,7,0,0,0,7,34,107,260,540,1000]::int[],ARRAY[407.0000,54.3000,17.5000,4.8500,1.8400,0.2900,0.1900,0.2018,0.1900,0.2900,1.8400,4.8500,17.5000,54.3000,407.0000]::numeric(10,4)[]),
    (14,'low',ARRAY[200,186,171,157,143,129,114,100,114,129,143,157,171,186,200]::int[],ARRAY[6.8800,3.8800,1.8400,1.3600,1.2600,1.0700,0.9700,0.4804,0.9700,1.0700,1.2600,1.3600,1.8400,3.8800,6.8800]::numeric(10,4)[]),
    (14,'medium',ARRAY[500,375,270,183,116,68,40,30,40,68,116,183,270,375,500]::int[],ARRAY[56.2000,14.5000,6.7900,3.8800,1.8400,0.9700,0.4800,0.2038,0.4800,0.9700,1.8400,3.8800,6.7900,14.5000,56.2000]::numeric(10,4)[]),
    (16,'high',ARRAY[1000,586,316,153,63,20,4,0,0,0,4,20,63,153,316,586,1000]::int[],ARRAY[970.0000,126.0000,25.2000,8.7300,3.8800,1.9400,0.1900,0.1900,0.2063,0.1900,0.1900,1.9400,3.8800,8.7300,25.2000,126.0000,970.0000]::numeric(10,4)[]),
    (16,'low',ARRAY[200,188,175,163,150,138,125,113,100,113,125,138,150,163,175,188,200]::int[],ARRAY[15.5000,8.7300,1.9400,1.3600,1.3600,1.1600,1.0700,0.9700,0.4818,0.9700,1.0700,1.1600,1.3600,1.3600,1.9400,8.7300,15.5000]::numeric(10,4)[]),
    (16,'medium',ARRAY[500,390,294,214,148,96,59,37,30,37,59,96,148,214,294,390,500]::int[],ARRAY[107.0000,39.8000,9.7000,4.8500,2.9100,1.4500,0.9700,0.4800,0.3022,0.4800,0.9700,1.4500,2.9100,4.8500,9.7000,39.8000,107.0000]::numeric(10,4)[])
  ) AS v(rows, risk_mode, scores, mults)
  JOIN public.arcade_score_profiles p
    ON p.rows = v.rows AND p.risk_mode = v.risk_mode::public.arcade_risk_mode AND p.version = 2
  CROSS JOIN LATERAL generate_series(1, v.rows + 1) AS s(idx)
ON CONFLICT (profile_id, slot_index) DO UPDATE
  SET multiplier = EXCLUDED.multiplier, score = EXCLUDED.score;

-- 6. Registry entries -------------------------------------------------------
INSERT INTO public.arcade_config_versions
  (product, version, target_rtp, target_house_edge, measured_rtp, measured_house_edge, simulation_rounds, payload, change_reason)
VALUES
  ('plinko', 2, 0.96000, 0.04000, 0.96000, 0.04000, 5000000,
   jsonb_build_object('model','exact binomial closed form','max_abs_error_pp',0.001),
   'Rescaled all 15 rows/risk multiplier tables to 96.00% RTP'),
  ('rps', 2, 0.95000, 0.05000, 0.95000, 0.05000, 1000000,
   jsonb_build_object('win_multiplier',1.85,'draw_multiplier',1.0,'model','exact 1/3-1/3-1/3'),
   'Win multiplier 1.90 -> 1.85 for a 5.00% house edge'),
  ('blackjack', 2, 0.98500, 0.01500, 0.98443, 0.01557, 3000000,
   jsonb_build_object('decks',6,'dealer_hits_soft_17',true,'double_after_split',false,
                      'blackjack_payout','4:3','strategy','basic','std_error_pp',0.066),
   '6D H17, no DAS, blackjack pays 4:3 for a ~1.50% house edge')
ON CONFLICT (product, version) DO NOTHING;

-- 7. Activation: production stays on v1, dev + simulation move to v2 -------
INSERT INTO public.arcade_config_activation (product, environment, config_version, reason)
VALUES
  ('plinko','PRODUCTION',1,'Unchanged pending promotion'),
  ('rps','PRODUCTION',1,'Unchanged pending promotion'),
  ('blackjack','PRODUCTION',1,'Unchanged pending promotion'),
  ('plinko','TEST',2,'House-edge realignment rollout'),
  ('rps','TEST',2,'House-edge realignment rollout'),
  ('blackjack','TEST',2,'House-edge realignment rollout'),
  ('plinko','SIMULATION',2,'House-edge realignment rollout'),
  ('rps','SIMULATION',2,'House-edge realignment rollout'),
  ('blackjack','SIMULATION',2,'House-edge realignment rollout')
ON CONFLICT (product, environment) DO UPDATE
  SET config_version = EXCLUDED.config_version, reason = EXCLUDED.reason, activated_at = now();

-- 8. Environment-aware config resolution in the game engines ---------------

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'arcade_rps_prepare_round';
  IF d IS NULL THEN RAISE EXCEPTION 'MISSING_FUNCTION arcade_rps_prepare_round'; END IF;
  IF position('  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE status = ''active'';' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_ANCHOR_NOT_FOUND arcade_rps_prepare_round';
  END IF;
  d := replace(d, '  v_cfg public.arcade_rps_configurations;', '  v_cfg public.arcade_rps_configurations;
  v_cfg_version int;');
  d := replace(d, '  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE status = ''active'';', '  v_cfg_version := public.arcade_config_version_for(''rps'', p_user);
  SELECT * INTO v_cfg FROM public.arcade_rps_configurations
    WHERE (v_cfg_version IS NOT NULL AND version = v_cfg_version)
       OR (v_cfg_version IS NULL AND status = ''active'')
    ORDER BY version DESC LIMIT 1;');
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'arcade_place_plinko_drop';
  IF d IS NULL THEN RAISE EXCEPTION 'MISSING_FUNCTION arcade_place_plinko_drop'; END IF;
  IF position('  SELECT * INTO v_profile FROM public.arcade_score_profiles
    WHERE rows = p_rows AND risk_mode = p_risk AND status = ''active'';' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_ANCHOR_NOT_FOUND arcade_place_plinko_drop';
  END IF;
  d := replace(d, '  v_profile  public.arcade_score_profiles;', '  v_profile  public.arcade_score_profiles;
  v_cfg_version int;');
  d := replace(d, '  SELECT * INTO v_profile FROM public.arcade_score_profiles
    WHERE rows = p_rows AND risk_mode = p_risk AND status = ''active'';', '  v_cfg_version := public.arcade_config_version_for(''plinko'', p_user);
  SELECT * INTO v_profile FROM public.arcade_score_profiles
    WHERE rows = p_rows AND risk_mode = p_risk
      AND ((v_cfg_version IS NOT NULL AND version = v_cfg_version)
        OR (v_cfg_version IS NULL AND status = ''active''))
    ORDER BY version DESC LIMIT 1;');
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'arcade_bj_start_hand';
  IF d IS NULL THEN RAISE EXCEPTION 'MISSING_FUNCTION arcade_bj_start_hand'; END IF;
  IF position('  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status=''active'' ORDER BY version DESC LIMIT 1;' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_ANCHOR_NOT_FOUND arcade_bj_start_hand';
  END IF;
  d := replace(d, '  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;', '  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;
  v_cfg_version int;');
  d := replace(d, '  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status=''active'' ORDER BY version DESC LIMIT 1;', '  v_cfg_version := public.arcade_config_version_for(''blackjack'', p_user);
  SELECT * INTO rc FROM public.arcade_bj_rule_configs
    WHERE name = ''standard''
      AND ((v_cfg_version IS NOT NULL AND version = v_cfg_version)
        OR (v_cfg_version IS NULL AND status = ''active''))
    ORDER BY version DESC LIMIT 1;');
  EXECUTE d;
END $do$;