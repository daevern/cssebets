-- Fix: Rock-Paper-Scissors was the only house-banked arcade product with a
-- 5-point minimum stake. Its table was created with
-- `min_stake numeric(14,2) NOT NULL DEFAULT 5` while every other product
-- defaults to a 1-point floor:
--   - arcade_bj_rule_configs.min_stake        DEFAULT 1
--   - arcade_treasure_configurations.min_stake DEFAULT 1 (easy profile = 1)
--   - arcade_roulette_configurations.min_total_stake DEFAULT 1
--   - arcade_place_plinko_drop() hardcodes p_stake >= 1
--
-- The frontend ChipRack always renders a "1" chip (CHIP_LADDER in
-- ChipRack.tsx includes 1 regardless of a table's configured chip_values),
-- so a player tapping the "1" chip on Rock-Paper-Scissors had it silently
-- clamped up to 5 in arcade.rps.tsx (`Math.max(c, minStake)`), or would be
-- rejected server-side with BELOW_MIN_STAKE if that clamp were ever
-- bypassed. This aligns RPS to the platform-wide 1-point minimum and adds
-- the "1" chip denomination so it round-trips end-to-end like every other
-- table.

UPDATE public.arcade_rps_configurations
   SET min_stake = 1,
       chip_values = (
         SELECT array_agg(DISTINCT v ORDER BY v)
           FROM unnest(array_cat(ARRAY[1]::numeric(14,2)[], chip_values)) AS v
       ),
       updated_at = now()
 WHERE min_stake <> 1
    OR NOT (1 = ANY (chip_values));

-- Keep future rows honest: a freshly-inserted RPS config (e.g. after a
-- retire/recreate) should default to the same 1-point minimum as every
-- other arcade product instead of silently reintroducing the 5-point floor.
ALTER TABLE public.arcade_rps_configurations
  ALTER COLUMN min_stake SET DEFAULT 1,
  ALTER COLUMN chip_values SET DEFAULT ARRAY[1, 5, 10, 25, 50, 100]::numeric(14, 2)[];

-- Regression guard: every house-banked arcade product must allow a 1-point
-- stake so the platform's advertised "bet 1 point" floor is actually
-- reachable, not just displayed by the shared ChipRack UI. Extends the
-- arcade_config_selftest() introduced in 20260806120500 with an 8th check.
CREATE OR REPLACE FUNCTION public.arcade_config_selftest()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.arcade_rps_rounds;
  v_cfg   public.arcade_rps_configurations;
  v_expected numeric(14,2);
  v_bad int := 0;
  v_n int := 0;
  r record;
  v_msg text;
BEGIN
  -- 1. environment matrix -------------------------------------------------
  FOR r IN SELECT unnest(ARRAY['plinko','rps','blackjack']) AS p LOOP
    check_name := format('env_matrix_%s', r.p);
    detail := format('PRODUCTION=v%s SIMULATION=v%s TEST=v%s',
      public.arcade_config_version_in_env(r.p,'PRODUCTION'),
      public.arcade_config_version_in_env(r.p,'SIMULATION'),
      public.arcade_config_version_in_env(r.p,'TEST'));
    passed := public.arcade_config_version_in_env(r.p,'PRODUCTION') = 1
          AND public.arcade_config_version_in_env(r.p,'SIMULATION') = 2
          AND public.arcade_config_version_in_env(r.p,'TEST') = 2;
    RETURN NEXT;
  END LOOP;

  -- 2. missing activation fails safe --------------------------------------
  BEGIN
    PERFORM public.arcade_config_version_in_env('__nonexistent__','PRODUCTION');
    check_name := 'missing_activation_fails_safe'; passed := false;
    detail := 'resolver returned a value for an unactivated product';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'missing_activation_fails_safe'; passed := true;
    detail := SQLERRM;
  END;
  RETURN NEXT;

  -- 3. promotion requires an admin ----------------------------------------
  BEGIN
    PERFORM public.arcade_promote_config('rps','TEST',1,'selftest must not succeed');
    check_name := 'promotion_requires_admin'; passed := false;
    detail := 'promotion succeeded without an admin caller';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'promotion_requires_admin'; passed := true; detail := SQLERRM;
  END;
  RETURN NEXT;

  BEGIN
    PERFORM public.arcade_rollback_config('rps','TEST','selftest must not succeed');
    check_name := 'rollback_requires_admin'; passed := false;
    detail := 'rollback succeeded without an admin caller';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'rollback_requires_admin'; passed := true; detail := SQLERRM;
  END;
  RETURN NEXT;

  -- 4. round configuration is immutable ------------------------------------
  SELECT * INTO v_round FROM public.arcade_rps_rounds
   WHERE status = 'SETTLED' ORDER BY settled_at DESC LIMIT 1;
  IF FOUND THEN
    BEGIN
      UPDATE public.arcade_rps_rounds SET config_version = config_version + 1 WHERE id = v_round.id;
      check_name := 'round_config_immutable'; passed := false;
      detail := 'config_version was mutable on a settled round';
      RAISE EXCEPTION 'ROLLBACK_SELFTEST';
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        check_name := 'round_config_immutable';
        passed := v_msg LIKE 'ROUND_CONFIG_IMMUTABLE%';
        detail := v_msg;
    END;
    RETURN NEXT;

    -- 5. flipping activation does not change a stored round ----------------
    BEGIN
      UPDATE public.arcade_config_activation
         SET config_version = CASE WHEN config_version = 1 THEN 2 ELSE 1 END
       WHERE product = 'rps' AND environment = 'SIMULATION';
      SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE id = v_round.config_id;
      check_name := 'round_pinned_across_activation_flip';
      passed := v_cfg.version = v_round.config_version;
      detail := format('round v%s still resolves config v%s while SIMULATION was flipped',
                       v_round.config_version, v_cfg.version);
      RAISE EXCEPTION 'ROLLBACK_SELFTEST';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'ROLLBACK_SELFTEST' THEN
        check_name := 'round_pinned_across_activation_flip'; passed := false; detail := v_msg;
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- 6. replay recent settled rounds against their stored configuration -----
  FOR r IN
    SELECT ro.stake, ro.outcome, ro.gross_return, c.win_multiplier, c.draw_multiplier, c.version
      FROM public.arcade_rps_rounds ro
      JOIN public.arcade_rps_configurations c ON c.id = ro.config_id
     WHERE ro.status = 'SETTLED'
     ORDER BY ro.settled_at DESC LIMIT 500
  LOOP
    v_n := v_n + 1;
    v_expected := round(r.stake * CASE r.outcome
      WHEN 'WIN' THEN r.win_multiplier WHEN 'DRAW' THEN r.draw_multiplier ELSE 0 END, 2);
    IF v_expected <> r.gross_return THEN v_bad := v_bad + 1; END IF;
  END LOOP;
  check_name := 'historical_replay_matches_stored_config';
  passed := v_bad = 0;
  detail := format('%s rounds replayed, %s mismatches', v_n, v_bad);
  RETURN NEXT;

  -- 7. capacity enforcement (Phase A: all liability-enforced arcade) -------
  SELECT count(*) INTO v_bad FROM public.accounting_migration_flags
   WHERE product IN ('plinko','rps','blackjack','roulette','treasure')
     AND liability_enforced = true
     AND capacity_enforced = false;
  check_name := 'capacity_enforced';
  passed := v_bad = 0;
  detail := format('%s liability-enforced arcade products with capacity_enforced=false', v_bad);
  RETURN NEXT;

  -- 8. every arcade product honours a 1-point minimum stake ---------------
  SELECT count(*) INTO v_bad FROM (
    SELECT 'rps' AS product WHERE EXISTS (
      SELECT 1 FROM public.arcade_rps_configurations WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'blackjack' WHERE EXISTS (
      SELECT 1 FROM public.arcade_bj_rule_configs WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'treasure' WHERE EXISTS (
      SELECT 1 FROM public.arcade_treasure_configurations WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'roulette' WHERE EXISTS (
      SELECT 1 FROM public.arcade_roulette_configurations WHERE status = 'active' AND min_total_stake > 1)
  ) offenders;
  check_name := 'min_stake_floor_consistent';
  passed := v_bad = 0;
  detail := format('%s active arcade configs with a minimum stake above 1 point', v_bad);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_config_selftest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_config_selftest() TO service_role;
