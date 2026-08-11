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
