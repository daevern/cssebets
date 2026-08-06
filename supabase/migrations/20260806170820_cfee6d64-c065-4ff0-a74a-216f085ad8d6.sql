
CREATE OR REPLACE FUNCTION public.arcade_admin_snapshot(p_admin uuid, p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_since timestamptz := now() - make_interval(hours => greatest(1, least(p_window_hours, 720)));
  v_live_cut timestamptz := now() - interval '60 seconds';
  v_games jsonb;
  v_activity jsonb;
  v_reserve numeric := 0;
BEGIN
  IF NOT (public.has_role(p_admin,'admin'::public.app_role)
          OR public.has_role(p_admin,'super_admin'::public.app_role)
          OR public.has_role(p_admin,'viewer'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  BEGIN
    v_reserve := public.accounting_available_reserve('PRODUCTION'::public.acct_environment);
  EXCEPTION WHEN OTHERS THEN v_reserve := NULL;
  END;

  WITH live AS (
    SELECT 'treasure'::text AS game, user_id, stake::numeric AS stake
      FROM public.arcade_treasure_rounds
     WHERE status::text IN ('CREATED','ACTIVE','COLLECTING')
    UNION ALL
    SELECT 'blackjack', user_id, coalesce(total_stake,0)
      FROM public.arcade_bj_hands
     WHERE status::text IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING')
    UNION ALL
    SELECT 'rps', user_id, coalesce(stake,0)
      FROM public.arcade_rps_rounds
     WHERE status = 'PREPARED' AND (expires_at IS NULL OR expires_at > now())
    UNION ALL
    SELECT 'plinko', user_id, coalesce(stake_per_ball,0)
      FROM public.arcade_plinko_games
     WHERE created_at >= v_live_cut
    UNION ALL
    SELECT 'roulette', user_id, coalesce(total_stake,0)
      FROM public.arcade_roulette_spins
     WHERE created_at >= v_live_cut
  ), live_agg AS (
    SELECT game, count(*)::int AS live_rounds, count(DISTINCT user_id)::int AS live_players,
           coalesce(sum(stake),0) AS live_stake
      FROM live GROUP BY game
  ), res AS (
    SELECT lower(coalesce(nullif(game,''), product)) AS game,
           coalesce(sum(reserved_amount),0) AS reserved
      FROM public.accounting_liability_reservations
     WHERE status = 'ACTIVE'
     GROUP BY 1
  ), rounds AS (
    SELECT 'treasure'::text AS game, user_id, stake::numeric AS stake, coalesce(gross_return,0)::numeric AS payout
      FROM public.arcade_treasure_rounds WHERE created_at >= v_since
    UNION ALL
    SELECT 'blackjack', user_id, coalesce(total_stake,0), coalesce(total_payout,0)
      FROM public.arcade_bj_hands WHERE created_at >= v_since
    UNION ALL
    SELECT 'rps', user_id, coalesce(stake,0), coalesce(gross_return,0)
      FROM public.arcade_rps_rounds WHERE created_at >= v_since AND status = 'SETTLED'
    UNION ALL
    SELECT 'plinko', user_id, coalesce(stake_per_ball,0), coalesce(payout,0)
      FROM public.arcade_plinko_games WHERE created_at >= v_since
    UNION ALL
    SELECT 'roulette', user_id, coalesce(total_stake,0), coalesce(total_return,0)
      FROM public.arcade_roulette_spins WHERE created_at >= v_since
  ), perf AS (
    SELECT game, count(*)::int AS rounds, count(DISTINCT user_id)::int AS players,
           coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid
      FROM rounds GROUP BY game
  ), all_games AS (
    SELECT unnest(ARRAY['plinko','roulette','treasure','blackjack','rps']) AS game
  )
  SELECT jsonb_agg(jsonb_build_object(
           'game', g.game,
           'livePlayers', coalesce(l.live_players,0),
           'liveRounds', coalesce(l.live_rounds,0),
           'liveStake', coalesce(l.live_stake,0),
           'reserved', coalesce(r.reserved,0),
           'rounds', coalesce(p.rounds,0),
           'players', coalesce(p.players,0),
           'staked', coalesce(p.staked,0),
           'paid', coalesce(p.paid,0),
           'houseNet', coalesce(p.staked,0) - coalesce(p.paid,0),
           'margin', CASE WHEN coalesce(p.staked,0) > 0
                          THEN round(((p.staked - p.paid) / p.staked) * 100, 2) ELSE NULL END
         ) ORDER BY g.game)
    INTO v_games
    FROM all_games g
    LEFT JOIN live_agg l ON l.game = g.game
    LEFT JOIN perf p ON p.game = g.game
    LEFT JOIN res r ON r.game = g.game;

  WITH f1 AS (
    SELECT 'treasure'::text AS game, id, user_id, stake::numeric AS stake,
           coalesce(gross_return,0)::numeric AS payout, status::text AS result, created_at
      FROM public.arcade_treasure_rounds ORDER BY created_at DESC LIMIT 40
  ), f2 AS (
    SELECT 'blackjack', id, user_id, coalesce(total_stake,0), coalesce(total_payout,0),
           coalesce(result::text, status::text), created_at
      FROM public.arcade_bj_hands ORDER BY created_at DESC LIMIT 40
  ), f3 AS (
    SELECT 'rps', id, user_id, coalesce(stake,0), coalesce(gross_return,0),
           coalesce(outcome, status), created_at
      FROM public.arcade_rps_rounds ORDER BY created_at DESC LIMIT 40
  ), f4 AS (
    SELECT 'plinko', id, user_id, coalesce(stake_per_ball,0), coalesce(payout,0),
           outcome::text, created_at
      FROM public.arcade_plinko_games ORDER BY created_at DESC LIMIT 40
  ), f5 AS (
    SELECT 'roulette', id, user_id, coalesce(total_stake,0), coalesce(total_return,0),
           status::text, created_at
      FROM public.arcade_roulette_spins ORDER BY created_at DESC LIMIT 40
  ), merged AS (
    SELECT * FROM f1 UNION ALL SELECT * FROM f2 UNION ALL SELECT * FROM f3
    UNION ALL SELECT * FROM f4 UNION ALL SELECT * FROM f5
  ), top50 AS (
    SELECT * FROM merged ORDER BY created_at DESC LIMIT 50
  )
  SELECT jsonb_agg(jsonb_build_object(
           'game', t.game, 'id', t.id, 'userId', t.user_id,
           'username', pr.display_name, 'stake', t.stake, 'payout', t.payout,
           'result', t.result, 'createdAt', t.created_at
         ) ORDER BY t.created_at DESC)
    INTO v_activity
    FROM top50 t LEFT JOIN public.profiles pr ON pr.id = t.user_id;

  RETURN jsonb_build_object(
    'windowHours', greatest(1, least(p_window_hours, 720)),
    'availableReserve', v_reserve,
    'games', coalesce(v_games,'[]'::jsonb),
    'activity', coalesce(v_activity,'[]'::jsonb),
    'generatedAt', now()
  );
END $fn$;
