BEGIN;

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

-- ==========================================================
-- Reconciliation note: while this migration was being authored on a
-- branch, the live project independently shipped an equivalent (and more
-- flexible) RPS ladder feature directly on main:
--   - arcade_rps_configurations.ladder_multipliers (numeric[]) +
--     ladder_tail_multiplier, resolved per-step via
--     public.arcade_rps_step_multiplier(cfg, step).
--   - arcade_rps_rounds.parent_round_id + ladder_step, set by
--     arcade_rps_prepare_round(p_user, p_parent_round_id) and consumed by
--     arcade_rps_settle() — see 20260806124837.
-- That is what the current frontend (rps.functions.ts, arcade.rps.tsx)
-- actually talks to (out_ladder_step / out_win_multiplier). This migration
-- originally re-defined arcade_rps_prepare_round with a different, 4-column
-- return on the same (uuid, uuid) signature, which would collide with the
-- already-shipped 6-column version and fail on a fresh replay — so it no
-- longer touches either function. Both designs solve the same underlying
-- ask (win #1 pays less than a flat rate, ladder position tracked
-- server-side so it can't be spoofed); the shipped one wins since it's
-- already live and admin-configurable.
--
-- What's left to actually do here: the shipped version tracks
-- parent_round_id but never enforced that a settled round can only ever
-- seed ONE continuation. Without that, a player could win once and fan
-- that single win out into several separate continuation bets that each
-- falsely claim the higher post-opening ladder rate instead of paying the
-- correct rate for what are actually independent fresh bets. Close that
-- gap, and extend the capacity self-test to replay settled rounds against
-- the real per-step ladder rate instead of a flat win_multiplier.
--
-- Bugbot review caught a real bug in the first cut of this fix: scoping
-- the uniqueness guard to *every* row with a parent_round_id (including
-- PREPARED rounds that later EXPIRE without ever being played) meant a
-- timed-out continuation permanently wedged that parent — the player's
-- next retry would insert a fresh PREPARED row with the same
-- parent_round_id and hit the unique index, failing outright instead of
-- just starting a new attempt at the correct ladder step. The only rows
-- that actually matter for the fan-out exploit are ones that *claimed* the
-- ladder continuation (WIN, which advances the ladder, or DRAW, which
-- holds it) — a round that expired or lost never granted anything, so it
-- must not consume the parent slot. Scope the guard to outcome IN
-- ('WIN','DRAW') instead of "has a parent at all".
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.arcade_rps_rounds
     WHERE parent_round_id IS NOT NULL AND outcome IN ('WIN','DRAW')
     GROUP BY parent_round_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'RPS_LADDER_FANOUT_EXISTS: one or more settled WIN/DRAW rounds are already claimed as parent_round_id by more than one continuation. Investigate arcade_rps_rounds for double-spent ladder wins before this migration can add the uniqueness guard.';
  END IF;
END $do$;

-- A round that actually claimed a ladder continuation (settled WIN or
-- DRAW) can seed at most one further continuation, closing the fan-out gap
-- described above — without blocking retries of a PREPARED continuation
-- that later expires or loses (outcome NULL or LOSS), which must remain
-- free to be re-prepared against the same parent. Complements the existing
-- (non-unique) arcade_rps_rounds_parent_idx from 20260806124837.
CREATE UNIQUE INDEX IF NOT EXISTS arcade_rps_rounds_parent_once
  ON public.arcade_rps_rounds (parent_round_id)
  WHERE parent_round_id IS NOT NULL AND outcome IN ('WIN','DRAW');

-- Extend the capacity self-test: replay settled rounds against the real
-- per-step ladder rate (arcade_rps_step_multiplier), and guard the ladder
-- chain against fan-out, on top of the existing checks from 20260806140000.
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

  -- 6. replay recent settled rounds against their real per-step ladder rate
  -- Bugbot review caught a second issue: rounds settled BEFORE the ladder
  -- feature went live (20260806124837) were priced at a flat win_multiplier
  -- with no ladder_step concept, but that column got backfilled to 1 on
  -- every pre-existing row. Replaying those against
  -- arcade_rps_step_multiplier(cfg, 1) recomputes the *new* ladder-aware
  -- rate, not the flat rate they were actually (correctly) paid at, so they
  -- show up as permanent false-positive mismatches and block this selftest
  -- forever. Only replay rounds settled at-or-after the ladder cutover.
  FOR r IN
    SELECT ro.stake, ro.outcome, ro.gross_return, ro.ladder_step,
           c AS cfg, c.draw_multiplier, c.version
      FROM public.arcade_rps_rounds ro
      JOIN public.arcade_rps_configurations c ON c.id = ro.config_id
     WHERE ro.status = 'SETTLED'
       AND ro.settled_at >= '2026-08-06 12:48:37+00'::timestamptz
     ORDER BY ro.settled_at DESC LIMIT 500
  LOOP
    v_n := v_n + 1;
    v_expected := round(r.stake * CASE r.outcome
      WHEN 'WIN' THEN public.arcade_rps_step_multiplier(r.cfg, r.ladder_step)
      WHEN 'DRAW' THEN r.draw_multiplier ELSE 0 END, 2);
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

  -- 9. RPS ladder chain cannot be fanned out (parent used more than once) --
  -- Matches the partial unique index above: only WIN/DRAW continuations
  -- actually claim the parent's ladder slot, so an expired or lost
  -- continuation sharing a parent_round_id is not a fork.
  SELECT count(*) INTO v_bad FROM (
    SELECT parent_round_id FROM public.arcade_rps_rounds
     WHERE parent_round_id IS NOT NULL AND outcome IN ('WIN','DRAW')
     GROUP BY parent_round_id HAVING count(*) > 1
  ) forks;
  check_name := 'rps_ladder_chain_not_forked';
  passed := v_bad = 0;
  detail := format('%s RPS rounds reused as a parent by more than one continuation', v_bad);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_config_selftest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_config_selftest() TO service_role;

-- ==========================================================
-- Security review finding (critical): arcade_publish_roulette_config,
-- arcade_publish_rps_config and arcade_admin_snapshot authorize on the
-- CALLER-SUPPLIED p_admin argument, not the actual invoking identity, and
-- are SECURITY DEFINER + GRANT EXECUTE ... TO authenticated. Any logged-in
-- user (member, pending, or viewer) can call them directly with the
-- Supabase client and pass a *known admin's UUID* as p_admin — the
-- has_role(p_admin, 'admin') check then passes even though the real caller
-- has no privilege at all, letting them push live changes to real-money
-- roulette/RPS payout configuration (multipliers, stake limits, chip
-- values) and read the live admin snapshot.
--
-- The legitimate app path (src/lib/arcade/arcade-admin.functions.ts)
-- already checks the caller's role in TypeScript before calling these RPCs
-- — but that check is bypassed entirely by calling the RPC directly, since
-- these functions were reachable by any `authenticated` role. That app
-- path also always calls through the service-role admin client (so
-- auth.uid() is not populated inside the function and can't be used as the
-- authorization source here without breaking the legitimate path).
--
-- Fix: restrict EXECUTE to service_role only, matching the already-correct
-- pattern used by arcade_publish_treasure_config. This closes the direct
-- unauthenticated-bypass path entirely; the only remaining caller is the
-- app's own server function, which already checks the role server-side
-- before ever reaching the RPC.
REVOKE EXECUTE ON FUNCTION public.arcade_publish_roulette_config(uuid, jsonb, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.arcade_publish_rps_config(uuid, jsonb, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.arcade_admin_snapshot(uuid, integer) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_publish_roulette_config(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_publish_rps_config(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_snapshot(uuid, integer) TO service_role;

-- Security review finding (medium): arcade_publish_rps_config validates
-- win_multiplier, draw_multiplier and ladder_tail_multiplier, but not the
-- individual steps of ladder_multipliers[] supplied in the patch — a patch
-- like {"ladder_multipliers": [50, 50, 50]} would publish live and bypass
-- the win_multiplier <= 5 cap entirely, since settlement resolves per-step
-- payout through arcade_rps_step_multiplier() over this array, not through
-- win_multiplier for steps within the ladder. Bound every step the same
-- way the flat multipliers already are.
CREATE OR REPLACE FUNCTION public.arcade_publish_rps_config(p_admin uuid, p_patch jsonb, p_reason text)
RETURNS public.arcade_rps_configurations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_cur public.arcade_rps_configurations; v_new public.arcade_rps_configurations;
BEGIN
  IF NOT (public.has_role(p_admin,'admin'::public.app_role) OR public.has_role(p_admin,'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_cur FROM public.arcade_rps_configurations WHERE status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  UPDATE public.arcade_rps_configurations SET status='archived', updated_at=now() WHERE id=v_cur.id;
  INSERT INTO public.arcade_rps_configurations(
    version, status, min_stake, max_stake, chip_values, win_multiplier, draw_multiplier,
    round_ttl_seconds, daily_round_limit, cooldown_seconds, maintenance_mode, announcement,
    ladder_multipliers, ladder_tail_multiplier
  ) VALUES (
    v_cur.version + 1, 'active',
    coalesce((p_patch->>'min_stake')::numeric, v_cur.min_stake),
    coalesce((p_patch->>'max_stake')::numeric, v_cur.max_stake),
    coalesce((SELECT array_agg(x::int ORDER BY ord) FROM jsonb_array_elements_text(p_patch->'chip_values') WITH ORDINALITY t(x,ord)), v_cur.chip_values),
    coalesce((p_patch->>'win_multiplier')::numeric, v_cur.win_multiplier),
    coalesce((p_patch->>'draw_multiplier')::numeric, v_cur.draw_multiplier),
    coalesce((p_patch->>'round_ttl_seconds')::int, v_cur.round_ttl_seconds),
    coalesce((p_patch->>'daily_round_limit')::int, v_cur.daily_round_limit),
    coalesce((p_patch->>'cooldown_seconds')::int, v_cur.cooldown_seconds),
    coalesce((p_patch->>'maintenance_mode')::boolean, v_cur.maintenance_mode),
    CASE WHEN p_patch ? 'announcement' THEN nullif(p_patch->>'announcement','') ELSE v_cur.announcement END,
    coalesce((SELECT array_agg(x::numeric ORDER BY ord) FROM jsonb_array_elements_text(p_patch->'ladder_multipliers') WITH ORDINALITY t(x,ord)), v_cur.ladder_multipliers),
    coalesce((p_patch->>'ladder_tail_multiplier')::numeric, v_cur.ladder_tail_multiplier)
  ) RETURNING * INTO v_new;
  IF v_new.min_stake > v_new.max_stake OR v_new.min_stake <= 0 THEN RAISE EXCEPTION 'INVALID_STAKE_RANGE'; END IF;
  IF v_new.win_multiplier <= 0 OR v_new.win_multiplier > 5 THEN RAISE EXCEPTION 'INVALID_WIN_MULTIPLIER'; END IF;
  IF v_new.draw_multiplier < 0 OR v_new.draw_multiplier > 2 THEN RAISE EXCEPTION 'INVALID_DRAW_MULTIPLIER'; END IF;
  IF v_new.ladder_tail_multiplier <= 0 OR v_new.ladder_tail_multiplier > 5 THEN RAISE EXCEPTION 'INVALID_LADDER_TAIL'; END IF;
  IF coalesce(array_length(v_new.ladder_multipliers,1),0) = 0 THEN RAISE EXCEPTION 'INVALID_LADDER_STEPS'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_new.ladder_multipliers) m WHERE m <= 0 OR m > 5) THEN
    RAISE EXCEPTION 'INVALID_LADDER_STEPS';
  END IF;
  PERFORM public.create_audit_log(p_admin,'arcade_rps_publish_config','arcade_rps_configurations',
    v_new.id::text, jsonb_build_object('version',v_new.version,'reason',p_reason,'patch',p_patch));
  RETURN v_new;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.arcade_publish_rps_config(uuid,jsonb,text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_publish_rps_config(uuid,jsonb,text) TO service_role;

COMMIT;