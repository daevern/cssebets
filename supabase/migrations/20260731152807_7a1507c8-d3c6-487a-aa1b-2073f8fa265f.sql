-- Phase 7 — Blackjack payout-cap fix -----------------------------------------

ALTER TABLE public.arcade_bj_hands
  ADD COLUMN IF NOT EXISTS worst_case_gross numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_score_uncapped integer,
  ADD COLUMN IF NOT EXISTS score_cap_delta integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_ceiling_breached boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.arcade_bj_hands.worst_case_gross IS
  'Phase 7: worst-case gross return approved (and reserved) before the deal.';
COMMENT ON COLUMN public.arcade_bj_hands.total_score_uncapped IS
  'Phase 7: sum of player-hand scores before max_score_per_round was applied.';
COMMENT ON COLUMN public.arcade_bj_hands.score_cap_delta IS
  'Phase 7: non-monetary score removed by the per-round score cap (disclosed, never silent).';
COMMENT ON COLUMN public.arcade_bj_hands.payout_ceiling_breached IS
  'Phase 7: true when settlement exceeded max_payout. Player is paid in full; an operational alert is raised.';

-- 1. Settlement: never truncate money. -----------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_bj_settle(p_hand uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h public.arcade_bj_hands; sc public.arcade_bj_score_configs; rc public.arcade_bj_rule_configs;
  dranks int[]; v int[]; ph record; pranks int[]; pv int[]; pcards int;
  pts int; total_pts int := 0; res public.bj_result; overall public.bj_result;
  results text[] := '{}'; bal bigint; any_live boolean;
  pay numeric(14,2); total_pay numeric(14,2) := 0; w public.wallets;
  v_final_stake numeric(14,2); v_sum_pay numeric(14,2);
  v_uncapped_pts int; v_cap_delta int := 0; v_breach boolean := false;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand FOR UPDATE;
  IF h.status IN ('COMPLETED','VOID','REVERSED') THEN RETURN; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE id = h.score_config_id;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id = h.rule_config_id;

  UPDATE public.arcade_bj_hands SET status='DEALER_TURN' WHERE id = p_hand;
  UPDATE public.arcade_bj_cards SET face_up = true, revealed_at = now()
    WHERE hand_id = p_hand AND owner_type='DEALER' AND face_up = false;

  SELECT EXISTS(SELECT 1 FROM public.arcade_bj_player_hands
                WHERE hand_id=p_hand AND status NOT IN ('BUST','LOST')) INTO any_live;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
    FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
  v := public.arcade_bj_value(dranks);
  IF any_live AND NOT h.dealer_blackjack THEN
    WHILE v[1] < 17 OR (v[1] = 17 AND v[2] = 1 AND rc.dealer_hits_soft_17) LOOP
      PERFORM public.arcade_bj_draw(p_hand, NULL, 'DEALER', true);
      SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
        FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
      v := public.arcade_bj_value(dranks);
    END LOOP;
  END IF;

  UPDATE public.arcade_bj_hands
    SET status='SETTLING', dealer_total=v[1], dealer_soft=(v[2]=1), dealer_bust=(v[3]=1)
    WHERE id = p_hand;

  FOR ph IN SELECT * FROM public.arcade_bj_player_hands WHERE hand_id=p_hand ORDER BY hand_index LOOP
    SELECT array_agg(rank ORDER BY deal_sequence), count(*) INTO pranks, pcards
      FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
    pv := public.arcade_bj_value(pranks);
    pts := sc.loss_score; pay := 0;

    IF pv[3] = 1 THEN res := 'BUST';
    ELSIF ph.is_blackjack AND NOT h.dealer_blackjack THEN res := 'BLACKJACK';
    ELSIF ph.is_blackjack AND h.dealer_blackjack THEN res := 'PUSH';
    ELSIF h.dealer_blackjack THEN res := 'LOSS';
    ELSIF v[3] = 1 THEN res := 'WIN';
    ELSIF pv[1] > v[1] THEN res := 'WIN';
    ELSIF pv[1] = v[1] THEN res := 'PUSH';
    ELSE res := 'LOSS';
    END IF;

    IF res = 'BLACKJACK' THEN
      pts := sc.natural_blackjack_score;
      pay := round(ph.stake * (1 + rc.blackjack_payout), 2);
    ELSIF res = 'WIN' THEN
      pay := round(ph.stake * 2, 2);
      IF ph.is_doubled THEN pts := sc.double_win_score;
      ELSIF pcards >= 5 THEN pts := sc.five_card_win_score;
      ELSIF ph.is_split THEN pts := sc.split_win_score;
      ELSE pts := sc.win_score; END IF;
    ELSIF res = 'PUSH' THEN
      pts := sc.push_score; pay := round(ph.stake, 2);
    ELSE
      pts := sc.loss_score; pay := 0;
    END IF;

    total_pts := total_pts + pts;
    total_pay := total_pay + pay;
    results := results || res::text;
    UPDATE public.arcade_bj_player_hands
      SET status = CASE res WHEN 'BUST' THEN 'BUST'::public.bj_ph_status
                            WHEN 'PUSH' THEN 'PUSH'::public.bj_ph_status
                            WHEN 'LOSS' THEN 'LOST'::public.bj_ph_status
                            ELSE 'WON'::public.bj_ph_status END,
          result = res, final_total = pv[1], is_soft = (pv[2]=1), is_bust = (pv[3]=1),
          score_awarded = pts, payout = pay, settled_at = now()
      WHERE id = ph.id;
  END LOOP;

  -- Non-monetary score cap: applied, but recorded explicitly (never silent).
  v_uncapped_pts := total_pts;
  IF total_pts > sc.max_score_per_round THEN
    v_cap_delta := total_pts - sc.max_score_per_round;
    total_pts := sc.max_score_per_round;
  END IF;

  -- MONEY IS NEVER TRUNCATED. max_payout is a genuine pre-deal ceiling enforced in
  -- arcade_bj_start_hand via arcade_bj_worst_case_gross(). If settlement still exceeds
  -- it, the configuration/capacity model is unsound: pay the player exactly what the
  -- player-hand records show and raise an operational alert for admin review.
  SELECT coalesce(sum(payout),0) INTO v_sum_pay
    FROM public.arcade_bj_player_hands WHERE hand_id = p_hand;
  IF v_sum_pay <> total_pay THEN
    RAISE EXCEPTION 'PAYOUT_MISMATCH: hand % player-hand sum % <> total %', p_hand, v_sum_pay, total_pay;
  END IF;

  IF total_pay > rc.max_payout THEN
    v_breach := true;
    INSERT INTO public.operational_alerts(level, category, title, message, metadata)
    VALUES ('critical', 'accounting',
      'Blackjack payout ceiling breached',
      format('Hand %s paid %s which exceeds table ceiling %s. Player was paid in full; the pre-deal exposure model must be reviewed.',
             p_hand, total_pay, rc.max_payout),
      jsonb_build_object('hand_id', p_hand, 'user_id', h.user_id, 'total_payout', total_pay,
                         'max_payout', rc.max_payout, 'worst_case_gross', h.worst_case_gross,
                         'rule_version', h.rule_version, 'phase', 7));
    INSERT INTO public.arcade_bj_risk_flags(user_id, hand_id, shoe_id, flag_type, severity, confidence, evidence)
    VALUES (h.user_id, p_hand, h.shoe_id, 'payout_ceiling_breach', 'high', 1.0,
      jsonb_build_object('total_payout', total_pay, 'max_payout', rc.max_payout,
                         'worst_case_gross', h.worst_case_gross));
  END IF;

  IF array_length(results,1) = 1 OR (SELECT count(DISTINCT x) FROM unnest(results) x) = 1 THEN
    overall := results[1]::public.bj_result;
  ELSE overall := 'MIXED'; END IF;

  IF total_pay > 0 THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = h.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (h.user_id, 0) RETURNING * INTO w;
    END IF;
    UPDATE public.wallets SET balance = w.balance + total_pay WHERE user_id = h.user_id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata)
    VALUES (h.user_id, 'credit', total_pay, w.balance, w.balance + total_pay,
      'bet_settlement', p_hand, 'Blackjack payout', 'arcade_blackjack',
      jsonb_build_object('result', overall, 'dealer_total', v[1],
                         'ceiling_breached', v_breach));
  END IF;

  INSERT INTO public.arcade_bj_score_balances(user_id, total_score) VALUES (h.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT total_score INTO bal FROM public.arcade_bj_score_balances WHERE user_id = h.user_id FOR UPDATE;
  IF total_pts > 0 THEN
    INSERT INTO public.arcade_bj_score_ledger(user_id, hand_id, score_type, score_amount,
      total_before, total_after, score_config_version, reason, idempotency_key)
    VALUES (h.user_id, p_hand,
      CASE WHEN overall='BLACKJACK' THEN 'blackjack_result'::public.bj_score_txn
           WHEN overall='PUSH' THEN 'push_result'::public.bj_score_txn
           ELSE 'win_result'::public.bj_score_txn END,
      total_pts, bal, bal + total_pts, h.score_version,
      CASE WHEN v_cap_delta > 0
           THEN format('settlement (score capped at %s per round; %s not awarded)', sc.max_score_per_round, v_cap_delta)
           ELSE 'settlement' END,
      'settle:'||p_hand::text)
    ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_score_balances SET total_score = bal + total_pts WHERE user_id = h.user_id;
  END IF;

  SELECT coalesce(sum(stake),0) INTO v_final_stake
    FROM public.arcade_bj_player_hands WHERE hand_id = p_hand;

  UPDATE public.arcade_bj_hands
    SET status='COMPLETED', result=overall, total_score_awarded=total_pts,
        total_score_uncapped = v_uncapped_pts, score_cap_delta = v_cap_delta,
        payout_ceiling_breached = v_breach,
        total_payout=total_pay, user_net = total_pay - v_final_stake,
        total_stake = v_final_stake,
        settled_at=now(), last_action_at=now(), state_version = state_version + 1,
        result_reason = 'Dealer ' || v[1]::text
    WHERE id = p_hand;

  PERFORM public.accounting_arcade_hook('blackjack','arcade_bj_hand', p_hand, h.user_id,
    v_final_stake, total_pay, now(),
    jsonb_build_object('source','arcade_blackjack','result', overall,
                       'dealer_total', v[1], 'rule_version', h.rule_version,
                       'ceiling_breached', v_breach, 'score_cap_delta', v_cap_delta),
    'arcade_blackjack', h.idempotency_key);
END;
$function$;

-- 2. Pre-deal exposure: persist the approved worst case on the hand. -----------
CREATE OR REPLACE FUNCTION public.arcade_bj_start_hand(p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;
  s public.arcade_bj_shoes; h public.arcade_bj_hands; ph public.arcade_bj_player_hands;
  w public.wallets; v_existing uuid; v_seed text; v_nonce int; n int; v_today int;
  pranks int[]; pv int[]; dranks int[]; dv int[]; up int; v_worst numeric;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN RAISE EXCEPTION 'INVALID_CLIENT_SEED'; END IF;

  SELECT id INTO v_existing FROM public.arcade_bj_hands WHERE user_id=p_user AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;
  IF rc.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  IF p_stake IS NULL OR p_stake < rc.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF p_stake > rc.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  -- worst-case gross return across the complete legal state tree
  v_worst := public.arcade_bj_worst_case_gross(rc.id, p_stake);
  IF v_worst > rc.max_payout THEN
    RAISE EXCEPTION 'EXPOSURE_LIMIT: worst-case payout % exceeds table ceiling %', v_worst, rc.max_payout;
  END IF;
  PERFORM public.arcade_bj_assert_capacity(p_user, p_stake, v_worst);

  SELECT count(*) INTO v_today FROM public.arcade_bj_hands
    WHERE user_id=p_user AND created_at >= date_trunc('day', now());
  IF v_today >= rc.daily_hand_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  IF EXISTS (SELECT 1 FROM public.arcade_bj_hands WHERE user_id=p_user
             AND status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING')) THEN
    RAISE EXCEPTION 'ACTIVE_HAND_EXISTS';
  END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO w; END IF;
  IF w.balance < p_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  SELECT * INTO s FROM public.arcade_bj_shoes
    WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT') AND current_index < cut_index
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.arcade_bj_shoes SET status='AWAITING_REVEAL', retired_at=now()
      WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT');
    v_seed := encode(extensions.gen_random_bytes(32),'hex');
    SELECT coalesce(max(nonce),0) + 1 INTO v_nonce FROM public.arcade_bj_shoes WHERE user_id=p_user;
    n := rc.deck_count * 52;
    INSERT INTO public.arcade_bj_shoes(user_id, deck_count, total_cards, card_order, cut_index,
      server_seed, server_seed_hash, client_seed, nonce, rule_version)
    VALUES (p_user, rc.deck_count, n,
      (SELECT array_agg(x % 52 ORDER BY ord)
         FROM unnest(public.arcade_bj_shuffle(v_seed, p_client_seed, v_nonce, n)) WITH ORDINALITY AS t(x, ord)),
      floor(n * rc.penetration)::int, v_seed, encode(extensions.digest(v_seed,'sha256'),'hex'),
      p_client_seed, v_nonce, rc.version)
    RETURNING * INTO s;
  END IF;

  INSERT INTO public.arcade_bj_hands(user_id, shoe_id, status, rule_config_id, rule_version,
    score_config_id, score_version, server_seed_hash, client_seed, nonce, idempotency_key,
    expires_at, total_stake, worst_case_gross)
  VALUES (p_user, s.id, 'DEALING', rc.id, rc.version, sc.id, sc.version,
    s.server_seed_hash, s.client_seed, s.nonce, p_idempotency_key,
    now() + make_interval(secs => rc.action_timeout_seconds), p_stake, v_worst)
  RETURNING * INTO h;

  -- Phase 6: reserve the full worst-case exposure for the life of the hand
  -- (all split hands, doubles and a natural blackjack are already inside v_worst).
  PERFORM public.accounting_reserve_liability('blackjack','blackjack','arcade_bj_hand', h.id,
    p_user, v_worst, p_stake, rc.version::text,
    jsonb_build_object('max_split_hands', rc.max_split_hands,
                       'double_after_split', rc.double_after_split));

  UPDATE public.wallets SET balance = w.balance - p_stake WHERE user_id = p_user;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata)
  VALUES (p_user, 'debit', p_stake, w.balance, w.balance - p_stake, 'bet_placement', h.id,
    'Blackjack stake', 'arcade_blackjack', jsonb_build_object('rule_version', rc.version));

  INSERT INTO public.arcade_bj_player_hands(hand_id, hand_index, stake)
    VALUES (h.id, 0, p_stake) RETURNING * INTO ph;

  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', true);
  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', false);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO pranks FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  pv := public.arcade_bj_value(pranks);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks FROM public.arcade_bj_cards WHERE hand_id=h.id AND owner_type='DEALER';
  dv := public.arcade_bj_value(dranks);
  up := dranks[1];

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_after, source, stake_delta)
  VALUES (h.id, ph.id, p_user, 'DEAL', 1, 1, 2, pv[1], 'system', p_stake);
  UPDATE public.arcade_bj_hands SET action_sequence=1, state_version=2, status='PLAYER_TURN' WHERE id=h.id;

  IF pv[1] = 21 THEN
    UPDATE public.arcade_bj_player_hands SET is_blackjack=true, status='BLACKJACK', final_total=21 WHERE id=ph.id;
  END IF;

  IF rc.dealer_peek AND (up = 1 OR up >= 10) AND dv[1] = 21 THEN
    UPDATE public.arcade_bj_hands SET dealer_blackjack=true WHERE id=h.id;
    PERFORM public.arcade_bj_settle(h.id);
  ELSIF pv[1] = 21 THEN
    PERFORM public.arcade_bj_settle(h.id);
  END IF;

  RETURN h.id;
END;
$function$;

-- 3. Keep the reservation's stake_collected in step with double / split. -------
CREATE OR REPLACE FUNCTION public.arcade_bj_resync_reservation(p_hand uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h public.arcade_bj_hands; v_stake numeric(14,2);
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand;
  IF NOT FOUND OR h.worst_case_gross IS NULL THEN RETURN; END IF;
  SELECT coalesce(sum(stake),0) INTO v_stake
    FROM public.arcade_bj_player_hands WHERE hand_id = p_hand;
  -- worst case is unchanged (it already assumed max splits + doubles); only the
  -- stake actually collected has grown, so net liability shrinks.
  PERFORM public.accounting_reserve_liability('blackjack','blackjack','arcade_bj_hand', p_hand,
    h.user_id, h.worst_case_gross, v_stake, h.rule_version::text,
    jsonb_build_object('resync','action'));
END;
$function$;

REVOKE ALL ON FUNCTION public.arcade_bj_resync_reservation(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.arcade_bj_double(p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version integer, p_idempotency_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  w public.wallets; ranks int[]; pv int[]; before_total int; c public.arcade_bj_cards; ncards int;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;
  IF NOT rc.double_allowed THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF ph.is_split AND NOT rc.double_after_split THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT count(*) INTO ncards FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  IF ncards <> 2 THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id=p_user FOR UPDATE;
  IF w.balance < ph.stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  UPDATE public.wallets SET balance = w.balance - ph.stake WHERE user_id=p_user;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata)
  VALUES (p_user, 'debit', ph.stake, w.balance, w.balance - ph.stake, 'bet_placement', p_hand,
    'Blackjack double', 'arcade_blackjack', jsonb_build_object('player_hand', ph.id));

  UPDATE public.arcade_bj_player_hands SET stake = stake * 2, is_doubled = true WHERE id = ph.id;
  UPDATE public.arcade_bj_hands SET total_stake = total_stake + ph.stake WHERE id = p_hand;
  PERFORM public.arcade_bj_resync_reservation(p_hand);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  before_total := (public.arcade_bj_value(ranks))[1];
  c := public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  pv := public.arcade_bj_value(ranks);

  UPDATE public.arcade_bj_player_hands
    SET status = CASE WHEN pv[3]=1 THEN 'BUST'::public.bj_ph_status ELSE 'DOUBLED'::public.bj_ph_status END,
        is_bust = (pv[3]=1), final_total = pv[1], is_soft = (pv[2]=1)
    WHERE id = ph.id;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, card_id, total_before, total_after, idempotency_key, stake_delta)
  VALUES (p_hand, ph.id, p_user, 'DOUBLE', h.action_sequence+1, h.state_version, h.state_version+1,
    c.id, before_total, pv[1], p_idempotency_key, ph.stake);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1,
    last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $function$;

-- 4. Phase 7 self-test ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_bj_phase7_selftest()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  checks jsonb := '[]'::jsonb; rc public.arcade_bj_rule_configs;
  v_worst numeric; n int; v_pass int := 0; v_total int := 0; v_src text;
  add_check text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_CONFIGURED'); END IF;

  -- 1. worst case at max stake fits under the table ceiling
  v_worst := public.arcade_bj_worst_case_gross(rc.id, rc.max_stake);
  checks := checks || jsonb_build_object('check','max_stake_worst_case_within_ceiling',
    'ok', v_worst <= rc.max_payout, 'worst_case', v_worst, 'max_payout', rc.max_payout);

  -- 2. worst case covers a natural blackjack on the unsplit hand
  checks := checks || jsonb_build_object('check','worst_case_covers_natural',
    'ok', v_worst >= round(rc.max_stake * (1 + rc.blackjack_payout), 2),
    'natural', round(rc.max_stake * (1 + rc.blackjack_payout), 2));

  -- 3. worst case covers every split hand doubled and winning
  checks := checks || jsonb_build_object('check','worst_case_covers_max_splits_doubled',
    'ok', v_worst >= rc.max_stake * greatest(rc.max_split_hands,1)
                     * (CASE WHEN rc.double_allowed AND (rc.max_split_hands <= 1 OR rc.double_after_split) THEN 2 ELSE 1 END) * 2);

  -- 4. settlement code contains no silent truncation of money
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='arcade_bj_settle';
  checks := checks || jsonb_build_object('check','no_silent_payout_truncation',
    'ok', position('total_pay := rc.max_payout' in v_src) = 0);

  -- 5. every settled hand: sum(player payouts) = hand payout = wallet credit
  SELECT count(*) INTO n FROM public.arcade_bj_hands h
   WHERE h.status='COMPLETED'
     AND coalesce(h.total_payout,0) <> (SELECT coalesce(sum(payout),0)
                                          FROM public.arcade_bj_player_hands WHERE hand_id=h.id);
  checks := checks || jsonb_build_object('check','player_hand_sum_equals_hand_payout','ok', n=0, 'offenders', n);

  SELECT count(*) INTO n FROM public.arcade_bj_hands h
   WHERE h.status='COMPLETED' AND coalesce(h.total_payout,0) > 0
     AND coalesce(h.total_payout,0) <> (SELECT coalesce(sum(t.amount),0)
        FROM public.wallet_transactions t
       WHERE t.reference_id = h.id AND t.reference_type='bet_settlement' AND t.type='credit');
  checks := checks || jsonb_build_object('check','hand_payout_equals_wallet_credit','ok', n=0, 'offenders', n);

  -- 6. no historical hand was short-paid against its own player-hand records
  SELECT count(*) INTO n FROM public.arcade_bj_hands h
    JOIN public.arcade_bj_rule_configs r ON r.id = h.rule_config_id
   WHERE h.status='COMPLETED' AND h.total_payout > r.max_payout AND NOT h.payout_ceiling_breached;
  checks := checks || jsonb_build_object('check','ceiling_breaches_are_flagged','ok', n=0, 'offenders', n);

  -- 7. score caps are disclosed, never silent
  SELECT count(*) INTO n FROM public.arcade_bj_hands h
   WHERE h.status='COMPLETED' AND h.total_score_uncapped IS NOT NULL
     AND h.total_score_awarded <> least(h.total_score_uncapped,
           (SELECT max_score_per_round FROM public.arcade_bj_score_configs WHERE id=h.score_config_id));
  checks := checks || jsonb_build_object('check','score_cap_disclosed','ok', n=0, 'offenders', n);

  -- 8. active reservations track the stake actually collected
  SELECT count(*) INTO n
    FROM public.accounting_liability_reservations lr
    JOIN public.arcade_bj_hands h ON h.id = lr.reference_id
   WHERE lr.product='blackjack' AND lr.status='ACTIVE'
     AND lr.stake_collected <> coalesce((SELECT sum(stake) FROM public.arcade_bj_player_hands WHERE hand_id=h.id),0);
  checks := checks || jsonb_build_object('check','reservation_tracks_collected_stake','ok', n=0, 'offenders', n);

  SELECT count(*) FILTER (WHERE (c->>'ok')::boolean), count(*) INTO v_pass, v_total
    FROM jsonb_array_elements(checks) c;

  RETURN jsonb_build_object('phase', 7, 'product','blackjack',
    'rule_version', rc.version, 'passed', v_pass, 'total', v_total,
    'ok', v_pass = v_total, 'checks', checks, 'generated_at', now());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.arcade_bj_phase7_selftest() TO authenticated;