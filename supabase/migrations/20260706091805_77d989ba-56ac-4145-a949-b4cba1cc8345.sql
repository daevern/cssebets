
-- ============================================================
-- Batch B: Settlement timing redesign (bugs #1, #9, #10)
-- ============================================================

-- 1. matches.finished_at — the "when did full time actually happen" anchor.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Backfill from updated_at for already-finished matches.
UPDATE public.matches
   SET finished_at = COALESCE(finished_at, updated_at)
 WHERE status = 'finished' AND finished_at IS NULL;

CREATE OR REPLACE FUNCTION public.matches_set_finished_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'finished')
     AND NEW.finished_at IS NULL THEN
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_matches_set_finished_at ON public.matches;
CREATE TRIGGER trg_matches_set_finished_at
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_set_finished_at();

-- 2. Delay wrapper — only grade cards/corners once stats have had time to
-- stabilize (API-Football commonly revises corner/shot totals for several
-- minutes after full time). Fulltime hook keeps retrying for 12h, so once the
-- delay elapses the pending bets settle on stable stats.
CREATE OR REPLACE FUNCTION public.settle_cards_corners_after_delay(
  p_match_id uuid,
  p_min_delay interval DEFAULT interval '10 minutes'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fin timestamptz;
BEGIN
  SELECT finished_at INTO v_fin FROM public.matches WHERE id = p_match_id;
  IF v_fin IS NULL OR (now() - v_fin) < p_min_delay THEN
    RETURN 0;
  END IF;
  RETURN public.settle_cards_corners_for_match(p_match_id);
END $$;
REVOKE ALL ON FUNCTION public.settle_cards_corners_after_delay(uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_cards_corners_after_delay(uuid, interval) TO service_role;

-- 3. Rewire the master settler to defer cards/corners via the delay wrapper.
-- Score/result/BTTS/etc settlement is unchanged.
CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid,
  p_home integer,
  p_away integer,
  p_home_ht integer DEFAULT NULL::integer,
  p_away_ht integer DEFAULT NULL::integer,
  p_qualifier text DEFAULT NULL::text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_qualifier text := p_qualifier;
  v_existing text;
BEGIN
  v_count := v_count + public.settle_match_atomic(p_match_id, p_home, p_away);
  v_count := v_count + public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht);

  IF v_qualifier IS NULL THEN
    SELECT qualifier INTO v_existing FROM public.matches WHERE id = p_match_id;
    v_qualifier := v_existing;
  END IF;
  IF v_qualifier IS NULL AND p_home IS NOT NULL AND p_away IS NOT NULL AND p_home <> p_away THEN
    v_qualifier := CASE WHEN p_home > p_away THEN 'HOME' ELSE 'AWAY' END;
    UPDATE public.matches
       SET qualifier = v_qualifier,
           updated_at = now()
     WHERE id = p_match_id
       AND qualifier IS NULL;
  END IF;

  IF v_qualifier IS NOT NULL THEN
    v_count := v_count + public.settle_to_qualify_for_match(p_match_id, v_qualifier);
  END IF;

  -- Cards/corners: only after the stats-stability delay
  v_count := v_count + public.settle_cards_corners_after_delay(p_match_id);
  RETURN v_count;
END $function$;

-- ============================================================
-- Batch C: Dispute flow + atomic manual regrade (bugs #5, #8)
-- ============================================================

-- 4. User-flag RPC — lets a user mark a settled bet for admin review.
CREATE OR REPLACE FUNCTION public.flag_prediction_for_review(
  p_prediction_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pred record; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason must be at least 3 characters';
  END IF;

  SELECT * INTO v_pred FROM public.predictions WHERE id = p_prediction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prediction not found'; END IF;
  IF v_pred.user_id <> v_uid THEN RAISE EXCEPTION 'Not your prediction'; END IF;
  IF v_pred.status = 'pending' THEN
    RAISE EXCEPTION 'Only settled bets can be flagged';
  END IF;

  UPDATE public.predictions
     SET flagged_for_review = true,
         flagged_reason = left(p_reason, 500)
   WHERE id = p_prediction_id;

  INSERT INTO public.operational_alerts(category, severity, title, detail, metadata) VALUES (
    'settlement', 'medium',
    'User flagged a settled bet for review',
    format('User %s flagged prediction %s (%s / %s): %s',
           v_uid::text, p_prediction_id::text, v_pred.market::text,
           v_pred.status::text, left(p_reason, 200)),
    jsonb_build_object(
      'prediction_id', p_prediction_id,
      'user_id', v_uid,
      'match_id', v_pred.match_id,
      'market', v_pred.market::text,
      'status', v_pred.status::text,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.flag_prediction_for_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_prediction_for_review(uuid, text) TO authenticated, service_role;

-- 5. Admin atomic manual regrade for ANY market. Handles wallet delta,
-- status flip, and audit_log in one transaction.
CREATE OR REPLACE FUNCTION public.regrade_prediction_manual(
  p_prediction_id uuid,
  p_new_status text,
  p_reason text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pred record; v_is_sim boolean;
  v_old_gross numeric; v_new_gross numeric; v_delta numeric;
  v_txn uuid;
  v_full_reason text;
BEGIN
  IF p_new_status NOT IN ('won','lost','void','pending') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason must be at least 3 characters';
  END IF;

  SELECT p.*, m.is_simulation AS match_is_sim
    INTO v_pred
    FROM public.predictions p
    LEFT JOIN public.matches m ON m.id = p.match_id
   WHERE p.id = p_prediction_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prediction not found'; END IF;

  v_is_sim := COALESCE(v_pred.match_is_sim, v_pred.is_simulation, false);

  IF v_pred.status::text = p_new_status THEN
    UPDATE public.predictions
       SET flagged_for_review = false
     WHERE id = v_pred.id;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  -- Gross value currently held vs new held (won pays full return, void refunds stake).
  v_old_gross := CASE v_pred.status::text
    WHEN 'won'  THEN COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds)
    WHEN 'void' THEN v_pred.virtual_stake
    ELSE 0 END;
  v_new_gross := CASE p_new_status
    WHEN 'won'  THEN COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds)
    WHEN 'void' THEN v_pred.virtual_stake
    ELSE 0 END;
  v_delta := v_new_gross - v_old_gross;
  v_full_reason := 'Manual regrade '||v_pred.status::text||'->'||p_new_status||': '||left(p_reason, 400);

  IF v_delta > 0 THEN
    SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
      p_user_id       := v_pred.user_id,
      p_type          := 'credit'::public.wallet_txn_type,
      p_amount        := v_delta,
      p_reference_type:= 'bet_settlement'::public.wallet_ref_type,
      p_reference_id  := v_pred.id,
      p_note          := v_full_reason,
      p_is_simulation := v_is_sim
    );
  ELSIF v_delta < 0 THEN
    SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
      p_user_id       := v_pred.user_id,
      p_type          := 'debit'::public.wallet_txn_type,
      p_amount        := ABS(v_delta),
      p_reference_type:= 'bet_settlement'::public.wallet_ref_type,
      p_reference_id  := v_pred.id,
      p_note          := v_full_reason,
      p_is_simulation := v_is_sim
    );
  END IF;

  UPDATE public.predictions
     SET status = p_new_status::public.prediction_status,
         settled_at = CASE WHEN p_new_status = 'pending' THEN NULL ELSE now() END,
         settled_result = p_new_status||':manual_regrade',
         points = CASE p_new_status WHEN 'won' THEN 3 ELSE 0 END,
         flagged_for_review = false
   WHERE id = v_pred.id;

  INSERT INTO public.audit_log(
    user_id, action, entity, entity_id, target_user_id,
    is_simulation, reason, metadata, old_value, new_value
  ) VALUES (
    p_actor_id, 'prediction.manual_regrade', 'prediction', v_pred.id,
    v_pred.user_id, v_is_sim, p_reason,
    jsonb_build_object('wallet_txn_id', v_txn, 'delta', v_delta, 'match_id', v_pred.match_id),
    jsonb_build_object('status', v_pred.status::text),
    jsonb_build_object('status', p_new_status)
  );

  INSERT INTO public.operational_alerts(category, severity, title, detail, metadata) VALUES (
    'settlement', 'medium',
    'Prediction manually regraded by admin',
    format('Prediction %s regraded %s -> %s (delta %s)',
      v_pred.id::text, v_pred.status::text, p_new_status, v_delta::text),
    jsonb_build_object(
      'prediction_id', v_pred.id, 'user_id', v_pred.user_id,
      'actor_id', p_actor_id, 'delta', v_delta,
      'wallet_txn_id', v_txn, 'reason', p_reason
    )
  );

  RETURN jsonb_build_object('ok', true, 'delta', v_delta, 'wallet_txn_id', v_txn);
END $$;
REVOKE ALL ON FUNCTION public.regrade_prediction_manual(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regrade_prediction_manual(uuid, text, text, uuid) TO service_role;
