-- 1. widen the mini engine to keno + crash -------------------------------
ALTER TABLE public.arcade_mini_configs DROP CONSTRAINT IF EXISTS arcade_mini_configs_product_check;
ALTER TABLE public.arcade_mini_configs ADD CONSTRAINT arcade_mini_configs_product_check
  CHECK (product = ANY (ARRAY['hilo','dice','wheel','keno','crash']));
ALTER TABLE public.arcade_mini_rounds DROP CONSTRAINT IF EXISTS arcade_mini_rounds_product_check;
ALTER TABLE public.arcade_mini_rounds ADD CONSTRAINT arcade_mini_rounds_product_check
  CHECK (product = ANY (ARRAY['hilo','dice','wheel','keno','crash']));

-- 2. accounting flags mirror dice ----------------------------------------
INSERT INTO public.accounting_migration_flags(product, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
SELECT p, f.journal_enabled, f.dual_write, f.liability_enforced, f.capacity_enforced, 'mini game'
  FROM (VALUES ('keno'),('crash')) v(p),
       public.accounting_migration_flags f
 WHERE f.product = 'dice'
   AND NOT EXISTS (SELECT 1 FROM public.accounting_migration_flags x WHERE x.product = v.p);

-- 3. published configs ----------------------------------------------------
INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
  target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, payload)
SELECT 'keno', 1, 'active', 1, 20, ARRAY[1,5,10,25,50]::numeric[], 0.96, 1000, 900, 1000,
  jsonb_build_object(
    'numbers', 40, 'draws', 10, 'max_picks', 10,
    'paytables', '{"classic":{"1":[0,3.84],"2":[0,1.67,5.44],"3":[0,0,5.02,22.5],"4":[0,0,2.62,7.52,43.8],"5":[0,0,0,7.66,28.4,209],"6":[0,0,0,4.24,11.9,56,517],"7":[0,0,0,0,12.9,46.1,271,1000],"8":[0,0,0,0,7.18,20.9,93.6,695,1000],"9":[0,0,0,0,0,23.5,86,486,1000,1000],"10":[0,0,0,0,0,13,40.6,188,1000,1000,1000]},"medium":{"1":[0,3.84],"2":[0,0,16.6],"3":[0,0,4.27,31],"4":[0,0,0,15.2,157],"5":[0,0,0,0,64.2,900],"6":[0,0,0,0,23.2,179,1000],"7":[0,0,0,0,0,104,1000,1000],"8":[0,0,0,0,0,41.6,302,1000,1000],"9":[0,0,0,0,0,0,245,1000,1000,1000],"10":[0,0,0,0,0,0,84,637,1000,1000,1000]},"high":{"1":[0,3.84],"2":[0,0,16.6],"3":[0,0,0,79],"4":[0,0,0,0,417],"5":[0,0,0,0,60.2,1000],"6":[0,0,0,0,0,459,1000],"7":[0,0,0,0,0,104,1000,1000],"8":[0,0,0,0,0,34.3,384,1000,1000],"9":[0,0,0,0,0,0,245,1000,1000,1000],"10":[0,0,0,0,0,0,68.9,815,1000,1000,1000]}}'::jsonb)
WHERE NOT EXISTS (SELECT 1 FROM public.arcade_mini_configs WHERE product = 'keno');

INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
  target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, payload)
SELECT 'crash', 1, 'active', 1, 100, ARRAY[1,5,10,25,50]::numeric[], 0.96, 100, 900, 1000,
  jsonb_build_object('house_edge', 0.04, 'growth_per_second', 0.12, 'min_cashout', 1.01, 'cap', 100)
WHERE NOT EXISTS (SELECT 1 FROM public.arcade_mini_configs WHERE product = 'crash');

-- 4. KENO -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_keno_draw(p_round public.arcade_mini_rounds, p_pool int, p_draws int)
RETURNS int[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_pool int[] := ARRAY(SELECT generate_series(1, p_pool));
  v_out int[] := '{}';
  v_input text;
  v_len int := p_pool;
  v_i int;
  v_j int;
BEGIN
  v_input := p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text;
  FOR v_i IN 1..p_draws LOOP
    v_j := 1 + floor(public.arcade_mini_rand(p_round.server_seed, v_input, v_i) * v_len)::int;
    IF v_j > v_len THEN v_j := v_len; END IF;
    v_out := v_out || v_pool[v_j];
    v_pool[v_j] := v_pool[v_len];
    v_len := v_len - 1;
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_keno_play(p_user uuid, p_stake numeric, p_risk text,
  p_picks int[], p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_pool int; v_draws int; v_maxpicks int;
  v_picks int[];
  v_table jsonb;
  v_max numeric(12,4);
  v_drawn int[];
  v_hits int;
  v_mult numeric(12,4);
  v_hex text;
  v_input text;
BEGIN
  IF p_risk NOT IN ('classic','medium','high') THEN RAISE EXCEPTION 'INVALID_RISK'; END IF;
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'keno' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_pool := coalesce((v_cfg.payload->>'numbers')::int, 40);
  v_draws := coalesce((v_cfg.payload->>'draws')::int, 10);
  v_maxpicks := coalesce((v_cfg.payload->>'max_picks')::int, 10);

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_picks FROM unnest(coalesce(p_picks,'{}'::int[])) x;
  IF v_picks IS NULL OR array_length(v_picks,1) < 1 OR array_length(v_picks,1) > v_maxpicks THEN
    RAISE EXCEPTION 'INVALID_PICKS';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_picks) x WHERE x < 1 OR x > v_pool) THEN
    RAISE EXCEPTION 'INVALID_PICKS';
  END IF;

  v_table := v_cfg.payload->'paytables'->p_risk->(array_length(v_picks,1))::text;
  IF v_table IS NULL THEN RAISE EXCEPTION 'INVALID_PICKS'; END IF;
  SELECT max(elem::text::numeric) INTO v_max FROM jsonb_array_elements(v_table) elem;

  v_round := public.arcade_mini_open(
    p_user, 'keno', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_max, 2),
    jsonb_build_object('risk', p_risk, 'picks', to_jsonb(v_picks), 'paytable', v_table));
  IF v_round.status = 'SETTLED' THEN RETURN v_round; END IF;

  v_input := v_round.client_seed || ':' || v_round.nonce::text || ':' || v_round.id::text;
  v_hex := public.arcade_mini_hex(v_round.server_seed, v_input, 0);
  v_drawn := public.arcade_keno_draw(v_round, v_pool, v_draws);

  SELECT count(*) INTO v_hits FROM unnest(v_drawn) d WHERE d = ANY (v_picks);
  v_mult := coalesce((v_table->v_hits)::text::numeric, 0);

  RETURN public.arcade_mini_close(
    v_round.id,
    CASE WHEN v_mult > 0 THEN 'WIN' ELSE 'LOSS' END,
    v_mult,
    v_round.state || jsonb_build_object('drawn', to_jsonb(v_drawn), 'hits', v_hits, 'multiplier', v_mult),
    v_hex);
END $$;

-- 5. CRASH ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_crash_point(p_round public.arcade_mini_rounds, p_edge numeric, p_cap numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT greatest(1.00, least(p_cap,
    floor(((1 - p_edge) / greatest(1 - public.arcade_mini_rand(p_round.server_seed,
      p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text, 0), 0.0000001)) * 100) / 100));
$$;

CREATE OR REPLACE FUNCTION public.arcade_crash_resolve(p_round public.arcade_mini_rounds)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_edge numeric := coalesce((p_round.state->>'house_edge')::numeric, 0.04);
  v_k numeric := coalesce((p_round.state->>'growth')::numeric, 0.12);
  v_cap numeric := coalesce((p_round.state->>'cap')::numeric, 100);
  v_auto numeric := nullif(p_round.state->>'auto','')::numeric;
  v_crash numeric := public.arcade_crash_point(p_round, v_edge, v_cap);
  v_elapsed numeric := extract(epoch FROM (now() - p_round.created_at));
  v_topped boolean := v_crash >= v_cap;
  v_end_at numeric := ln(greatest(v_crash, 1.0000001)) / v_k;
BEGIN
  IF p_round.status <> 'ACTIVE' THEN RETURN p_round; END IF;
  IF v_auto IS NOT NULL AND v_auto <= v_crash
     AND v_elapsed >= ln(greatest(v_auto, 1.0000001)) / v_k THEN
    RETURN public.arcade_mini_close(p_round.id, 'WIN', v_auto,
      p_round.state || jsonb_build_object('crash', v_crash, 'cashed_at', v_auto, 'auto_settled', true), NULL);
  END IF;
  IF v_elapsed < v_end_at THEN RETURN p_round; END IF;
  IF v_topped THEN
    RETURN public.arcade_mini_close(p_round.id, 'WIN', v_cap,
      p_round.state || jsonb_build_object('crash', v_crash, 'cashed_at', v_cap, 'topped_out', true), NULL);
  END IF;
  RETURN public.arcade_mini_close(p_round.id, 'LOSS', 0,
    p_round.state || jsonb_build_object('crash', v_crash, 'busted', true), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_crash_sweep(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_round public.arcade_mini_rounds;
BEGIN
  FOR v_round IN
    SELECT * FROM public.arcade_mini_rounds
     WHERE user_id = p_user AND product = 'crash' AND status = 'ACTIVE'
     FOR UPDATE
  LOOP
    PERFORM public.arcade_crash_resolve(v_round);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_crash_start(p_user uuid, p_stake numeric, p_auto numeric,
  p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_cap numeric; v_edge numeric; v_k numeric; v_min numeric;
  v_auto numeric;
BEGIN
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'crash' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_cap := coalesce((v_cfg.payload->>'cap')::numeric, v_cfg.max_multiplier);
  v_edge := coalesce((v_cfg.payload->>'house_edge')::numeric, 0.04);
  v_k := coalesce((v_cfg.payload->>'growth_per_second')::numeric, 0.12);
  v_min := coalesce((v_cfg.payload->>'min_cashout')::numeric, 1.01);

  PERFORM public.arcade_crash_sweep(p_user);
  IF EXISTS (SELECT 1 FROM public.arcade_mini_rounds
              WHERE user_id = p_user AND product = 'crash' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'ROUND_IN_PROGRESS';
  END IF;

  v_auto := round(p_auto, 2);
  IF v_auto IS NOT NULL AND (v_auto < v_min OR v_auto > v_cap) THEN RAISE EXCEPTION 'INVALID_AUTO_CASHOUT'; END IF;

  v_round := public.arcade_mini_open(
    p_user, 'crash', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * coalesce(v_auto, v_cap), 2),
    jsonb_build_object('house_edge', v_edge, 'growth', v_k, 'cap', v_cap,
                       'min_cashout', v_min, 'auto', v_auto));
  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_crash_cashout(p_user uuid, p_round_id uuid)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_edge numeric; v_k numeric; v_cap numeric; v_min numeric; v_auto numeric;
  v_crash numeric; v_elapsed numeric; v_mult numeric;
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'crash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;

  v_edge := coalesce((v_round.state->>'house_edge')::numeric, 0.04);
  v_k := coalesce((v_round.state->>'growth')::numeric, 0.12);
  v_cap := coalesce((v_round.state->>'cap')::numeric, 100);
  v_min := coalesce((v_round.state->>'min_cashout')::numeric, 1.01);
  v_auto := nullif(v_round.state->>'auto','')::numeric;

  v_crash := public.arcade_crash_point(v_round, v_edge, v_cap);
  v_elapsed := extract(epoch FROM (now() - v_round.created_at));
  v_mult := floor(exp(v_k * v_elapsed) * 100) / 100;
  IF v_mult < v_min THEN v_mult := v_min; END IF;
  IF v_auto IS NOT NULL AND v_mult > v_auto THEN v_mult := v_auto; END IF;
  IF v_mult > v_cap THEN v_mult := v_cap; END IF;

  IF v_mult >= v_crash AND v_crash < v_cap THEN
    RETURN public.arcade_mini_close(v_round.id, 'LOSS', 0,
      v_round.state || jsonb_build_object('crash', v_crash, 'busted', true), NULL);
  END IF;

  RETURN public.arcade_mini_close(v_round.id, 'WIN', v_mult,
    v_round.state || jsonb_build_object('crash', v_crash, 'cashed_at', v_mult), NULL);
END $$;

-- 6. admin config publishing for every mini table -------------------------
CREATE OR REPLACE FUNCTION public.arcade_publish_mini_config(p_admin uuid, p_product text, p_patch jsonb, p_reason text)
RETURNS public.arcade_mini_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cur public.arcade_mini_configs; v_new public.arcade_mini_configs;
BEGIN
  IF NOT (public.has_role(p_admin,'admin'::public.app_role) OR public.has_role(p_admin,'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF p_product NOT IN ('hilo','dice','wheel','keno','crash') THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;

  SELECT * INTO v_cur FROM public.arcade_mini_configs
   WHERE product = p_product AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  UPDATE public.arcade_mini_configs SET status = 'retired', updated_at = now() WHERE id = v_cur.id;

  INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
    target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, cooldown_seconds,
    maintenance_mode, announcement, payload)
  VALUES (
    v_cur.product, v_cur.version + 1, 'active',
    coalesce((p_patch->>'min_stake')::numeric, v_cur.min_stake),
    coalesce((p_patch->>'max_stake')::numeric, v_cur.max_stake),
    coalesce((SELECT array_agg(x::numeric ORDER BY ord)
                FROM jsonb_array_elements_text(p_patch->'chip_values') WITH ORDINALITY t(x,ord)), v_cur.chip_values),
    coalesce((p_patch->>'target_rtp')::numeric, v_cur.target_rtp),
    coalesce((p_patch->>'max_multiplier')::numeric, v_cur.max_multiplier),
    coalesce((p_patch->>'round_ttl_seconds')::int, v_cur.round_ttl_seconds),
    coalesce((p_patch->>'daily_round_limit')::int, v_cur.daily_round_limit),
    coalesce((p_patch->>'cooldown_seconds')::int, v_cur.cooldown_seconds),
    coalesce((p_patch->>'maintenance_mode')::boolean, v_cur.maintenance_mode),
    CASE WHEN p_patch ? 'announcement' THEN nullif(p_patch->>'announcement','') ELSE v_cur.announcement END,
    coalesce(p_patch->'payload', v_cur.payload)
  ) RETURNING * INTO v_new;

  IF v_new.min_stake <= 0 OR v_new.min_stake > v_new.max_stake THEN RAISE EXCEPTION 'INVALID_STAKE_RANGE'; END IF;
  IF v_new.target_rtp <= 0.5 OR v_new.target_rtp > 1 THEN RAISE EXCEPTION 'INVALID_TARGET_RTP'; END IF;
  IF v_new.max_multiplier <= 0 OR v_new.max_multiplier > 10000 THEN RAISE EXCEPTION 'INVALID_MAX_MULTIPLIER'; END IF;
  IF v_new.daily_round_limit <= 0 THEN RAISE EXCEPTION 'INVALID_DAILY_LIMIT'; END IF;

  PERFORM public.create_audit_log(p_admin,'arcade_mini_publish_config','arcade_mini_configs',
    v_new.id::text, jsonb_build_object('product', v_new.product, 'version', v_new.version,
                                       'reason', p_reason, 'patch', p_patch));
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.arcade_keno_draw(public.arcade_mini_rounds, int, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_keno_play(uuid, numeric, text, int[], text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_crash_point(public.arcade_mini_rounds, numeric, numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_crash_resolve(public.arcade_mini_rounds) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_crash_sweep(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_crash_start(uuid, numeric, numeric, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_crash_cashout(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_publish_mini_config(uuid, text, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_keno_play(uuid, numeric, text, int[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_crash_start(uuid, numeric, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_crash_cashout(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_crash_sweep(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_publish_mini_config(uuid, text, jsonb, text) TO service_role;