-- Fix: matches_score_change_guard was incorrectly firing on the initial
-- live -> finished transition. Because live matches carry intermediate
-- scores (OLD.home_score IS NOT NULL), the previous NULL-guard didn't
-- protect first-time settlements. If any prior admin `void` existed on
-- the match, the trigger tried to "reverse" those voids on final settle,
-- which debits users who may have spent that refund -> INSUFFICIENT_BALANCE
-- rolls back the entire status update. Matches were stuck as `live` with
-- all bets stuck as PENDING (e.g. Spain vs Austria, Portugal vs Croatia).
--
-- Correct behavior: the guard exists solely for CORRECTIONS to a
-- previously-finished match. Only run reverse+resettle when the match was
-- already `finished` before this update AND at least one prediction is
-- won/lost. Voids alone do not indicate settlement occurred.

CREATE OR REPLACE FUNCTION public.matches_score_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Only reverse+resettle when the match was ALREADY finished. Any change
  -- into `finished` (scheduled/live -> finished) is initial settlement and
  -- must be handled by the caller. Pre-existing `void` predictions from
  -- per-bet admin action are NOT evidence of prior settlement.
  IF OLD.status IS DISTINCT FROM 'finished'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.predictions
    WHERE match_id = NEW.id
      AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status)
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
END
$$;