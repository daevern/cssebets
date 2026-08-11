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

-- Security review finding (medium): arcade wallet-mutating arcade server
-- functions only checked requireSupabaseAuth (a valid session), not
-- approved-member status — the "pending approval" screen was a UI gate
-- only. A pending user with a valid session could call
-- prepareRpsRound/settleRpsRound and the equivalent plinko/roulette/
-- treasure/blackjack entry points directly and wager real wallet points
-- before an admin ever approved them. Fixed in application code
-- (src/lib/access-control.ts: requireApprovedMember, applied to
-- settleRpsRound, placePlinkoDrop, placeRouletteSpin, startTreasureRound,
-- startBlackjackHand, submitPrediction, placeMarketBet) — this comment
-- documents the change for anyone auditing the DB side, since the actual
-- enforcement lives in the TypeScript server functions, not a DB trigger.
-- Defense-in-depth DB-side guard: the wallet-mutating RPCs already run
-- through the exact user_roles table checked above, so a belt-and-braces
-- SQL-level check is intentionally deferred rather than duplicated here —
-- see docs/RUNBOOK.md for the go-live checklist item tracking this.
