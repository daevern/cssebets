-- Safeguard: when a finished match's score is edited AFTER predictions are already settled,
-- automatically reverse the prior payouts and re-settle against the corrected score.
-- Prevents silent mispayouts like the Egypt vs Iran (1-1 vs 1-2) and Spain vs Saudi Arabia (4-0 vs 5-0) cases.

CREATE OR REPLACE FUNCTION public.reverse_settled_predictions_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pred RECORD;
  v_payout numeric;
  v_count int := 0;
  v_sim boolean;
BEGIN
  SELECT COALESCE(is_simulation,false) INTO v_sim FROM public.matches WHERE id = p_match_id;
  FOR v_pred IN
    SELECT * FROM public.predictions
     WHERE match_id = p_match_id
       AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status,'void'::public.prediction_status)
     FOR UPDATE
  LOOP
    IF v_pred.status = 'won'::public.prediction_status THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Auto-reversal: match score corrected', v_sim);
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, v_payout, v_pred.id, p_match_id,
        'Auto-reversal: match score corrected', v_sim);
    ELSIF v_pred.status = 'void'::public.prediction_status THEN
      -- Void had refunded the stake; pull it back so the re-settlement can pay correctly.
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'debit'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Auto-reversal of void: match score corrected', v_sim);
      PERFORM public.platform_apply_change(
        'stake_collected'::public.platform_txn_type, v_pred.virtual_stake, v_pred.id, p_match_id,
        'Auto-reversal of void: match score corrected', v_sim);
    END IF;
    -- Reset to pending so settle_match_all_markets_atomic regrades it.
    UPDATE public.predictions
       SET status='pending'::public.prediction_status,
           points=0,
           settled_at=NULL,
           settled_result=NULL
     WHERE id = v_pred.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.reverse_settled_predictions_for_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_settled_predictions_for_match(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.matches_score_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_settled boolean;
  v_reversed int := 0;
  v_resettled int := 0;
  v_score_changed boolean;
  v_ht_changed boolean;
BEGIN
  v_score_changed := (NEW.home_score IS DISTINCT FROM OLD.home_score)
                  OR (NEW.away_score IS DISTINCT FROM OLD.away_score);
  v_ht_changed := (NEW.home_score_ht IS DISTINCT FROM OLD.home_score_ht)
               OR (NEW.away_score_ht IS DISTINCT FROM OLD.away_score_ht);
  IF NOT (v_score_changed OR v_ht_changed) THEN
    RETURN NEW;
  END IF;
  IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.predictions
    WHERE match_id = NEW.id
      AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status,'void'::public.prediction_status)
  ) INTO v_has_settled;

  IF NOT v_has_settled THEN
    RETURN NEW;
  END IF;

  v_reversed := public.reverse_settled_predictions_for_match(NEW.id);
  v_resettled := public.settle_match_all_markets_atomic(
    NEW.id, NEW.home_score, NEW.away_score, NEW.home_score_ht, NEW.away_score_ht);

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, reason)
  VALUES (NULL, 'match.score_corrected_auto_resettle', 'matches', NEW.id,
    jsonb_build_object(
      'old_score', COALESCE(OLD.home_score::text,'?')||'-'||COALESCE(OLD.away_score::text,'?'),
      'new_score', NEW.home_score::text||'-'||NEW.away_score::text,
      'old_ht', COALESCE(OLD.home_score_ht::text,'?')||'-'||COALESCE(OLD.away_score_ht::text,'?'),
      'new_ht', COALESCE(NEW.home_score_ht::text,'?')||'-'||COALESCE(NEW.away_score_ht::text,'?'),
      'reversed', v_reversed,
      'resettled', v_resettled),
    'Score changed after settlement; predictions auto-reversed and re-settled');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matches_score_change_guard ON public.matches;
CREATE TRIGGER matches_score_change_guard
  AFTER UPDATE OF home_score, away_score, home_score_ht, away_score_ht
  ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.matches_score_change_guard();