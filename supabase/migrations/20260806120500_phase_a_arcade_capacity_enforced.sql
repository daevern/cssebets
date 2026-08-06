-- Phase A: enforce arcade capacity for every house-banked product.
-- Prior migration (20260806030908) only re-enabled plinko/rps/blackjack.
-- Roulette + treasure must also reject over-reserve play instead of
-- writing an advisory operational_alert and accepting the round.

UPDATE public.accounting_migration_flags
   SET capacity_enforced = true,
       updated_at = now()
 WHERE product IN ('plinko', 'rps', 'blackjack', 'roulette', 'treasure')
   AND capacity_enforced = false;

-- Tighten arcade_config_selftest capacity check to all liability-enforced
-- arcade products. All other checks preserved from 20260806031147.
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
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_config_selftest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_config_selftest() TO service_role;
