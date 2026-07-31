-- 1. Concurrency-safe version allocation ------------------------------------
CREATE OR REPLACE FUNCTION public.settlement_next_version(
  p_product text, p_reference_id uuid, p_action text
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_max int; v_max_settle int;
BEGIN
  -- Serialise version allocation for this (product, reference) for the rest of
  -- the transaction. Two concurrent settlers can no longer read the same MAX.
  PERFORM pg_advisory_xact_lock(hashtext(p_product), hashtext(p_reference_id::text));

  SELECT COALESCE(MAX(settlement_version), 0),
         COALESCE(MAX(settlement_version) FILTER (
           WHERE settlement_action IN ('settle','resettle','regrade')), 0)
    INTO v_max, v_max_settle
  FROM public.settlement_journal
  WHERE product = p_product AND reference_id = p_reference_id;

  IF p_action = 'reverse' THEN
    -- A reversal belongs to the version it reverses.
    RETURN GREATEST(v_max_settle, 1);
  END IF;

  RETURN v_max + 1;
END $$;

CREATE OR REPLACE FUNCTION public.settlement_next_version(
  p_product text, p_reference_id uuid
) RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.settlement_next_version(p_product, p_reference_id, 'settle') $$;

-- 2. settlement_claim allocates the version for the correct action ----------
CREATE OR REPLACE FUNCTION public.settlement_claim(
  p_product text, p_reference_id uuid, p_action text,
  p_previous_status text DEFAULT NULL, p_final_status text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_gross_payout numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_version integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_version int; v_id uuid;
BEGIN
  v_version := COALESCE(p_version, public.settlement_next_version(p_product, p_reference_id, p_action));
  INSERT INTO public.settlement_journal(
    product, reference_id, settlement_version, settlement_action, idempotency_key,
    previous_status, final_status, user_id, gross_payout, metadata)
  VALUES (
    p_product, p_reference_id, v_version, p_action,
    p_product || ':' || p_reference_id::text || ':v' || v_version || ':' || p_action,
    p_previous_status, p_final_status, p_user_id, p_gross_payout, COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id; -- NULL => already claimed
END $$;

-- 3. Controlled application response for duplicate settlement ---------------
CREATE OR REPLACE FUNCTION public.settlement_try_claim(
  p_product text, p_reference_id uuid, p_action text,
  p_previous_status text DEFAULT NULL, p_final_status text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_gross_payout numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_version int; v_id uuid; v_existing public.settlement_journal;
BEGIN
  v_version := COALESCE(p_version, public.settlement_next_version(p_product, p_reference_id, p_action));
  BEGIN
    INSERT INTO public.settlement_journal(
      product, reference_id, settlement_version, settlement_action, idempotency_key,
      previous_status, final_status, user_id, gross_payout, metadata)
    VALUES (
      p_product, p_reference_id, v_version, p_action,
      p_product || ':' || p_reference_id::text || ':v' || v_version || ':' || p_action,
      p_previous_status, p_final_status, p_user_id, p_gross_payout, COALESCE(p_metadata,'{}'::jsonb))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.settlement_journal
    WHERE product = p_product AND reference_id = p_reference_id
      AND settlement_version = v_version AND settlement_action = p_action;
    RETURN jsonb_build_object(
      'status','ALREADY_SETTLED',
      'claimed', false,
      'claim_id', v_existing.id,
      'settlement_version', v_existing.settlement_version,
      'settlement_action', v_existing.settlement_action,
      'final_status', v_existing.final_status,
      'gross_payout', v_existing.gross_payout,
      'settled_at', v_existing.created_at);
  END;

  RETURN jsonb_build_object(
    'status','CLAIMED', 'claimed', true, 'claim_id', v_id,
    'settlement_version', v_version, 'settlement_action', p_action);
END $$;

GRANT EXECUTE ON FUNCTION public.settlement_try_claim(text,uuid,text,text,text,uuid,numeric,jsonb,integer) TO service_role;

-- 4. Guard raises a labelled ALREADY_SETTLED error --------------------------
CREATE OR REPLACE FUNCTION public.settlement_journal_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_product  text   := TG_ARGV[0];
  v_col      text   := TG_ARGV[1];
  v_terminal text[] := string_to_array(TG_ARGV[2], ',');
  v_open     text[] := string_to_array(TG_ARGV[3], ',');
  v_revst    text[] := CASE WHEN TG_NARGS > 4 AND COALESCE(TG_ARGV[4],'') <> ''
                            THEN string_to_array(TG_ARGV[4], ',') ELSE ARRAY[]::text[] END;
  v_oldj jsonb := to_jsonb(OLD);
  v_newj jsonb := to_jsonb(NEW);
  v_old text; v_new text; v_action text; v_version int; v_user uuid; v_key text;
BEGIN
  v_old := v_oldj->>v_col;
  v_new := v_newj->>v_col;
  IF v_new IS NOT DISTINCT FROM v_old THEN RETURN NEW; END IF;

  IF v_new = ANY(v_terminal) AND (v_old IS NULL OR NOT (v_old = ANY(v_terminal))) THEN
    v_action := 'settle';
  ELSIF v_old = ANY(v_terminal) AND (v_new = ANY(v_open)) THEN
    v_action := 'reverse';
  ELSIF v_old = ANY(v_terminal) AND (v_new = ANY(v_revst)) THEN
    v_action := 'reverse';
  ELSE
    RETURN NEW;
  END IF;

  v_version := public.settlement_next_version(v_product, (v_newj->>'id')::uuid, v_action);
  BEGIN v_user := (v_newj->>'user_id')::uuid; EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  v_key := v_product || ':' || (v_newj->>'id') || ':v' || v_version || ':' || v_action;

  -- A duplicate settlement MUST abort the transaction before any wallet or
  -- bankroll movement commits, but with a controlled, classifiable error.
  BEGIN
    INSERT INTO public.settlement_journal(
      product, reference_id, settlement_version, settlement_action, idempotency_key,
      previous_status, final_status, user_id, metadata)
    VALUES (
      v_product, (v_newj->>'id')::uuid, v_version, v_action, v_key,
      v_old, v_new, v_user,
      jsonb_build_object('table', TG_TABLE_NAME, 'status_column', v_col));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: % % v% (%)', v_product, v_action, v_version, v_key
      USING ERRCODE = 'P0409',
            HINT = 'This settlement version was already recorded; no money was moved.';
  END;

  RETURN NEW;
END $$;

-- 5. Football score guard: allow legitimate regrade back to an earlier score
CREATE OR REPLACE FUNCTION public.matches_score_change_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_has_settled boolean;
  v_reversed int := 0;
  v_resettled int := 0;
  v_score_changed boolean;
  v_ht_changed boolean;
  v_basis text;
  v_cycles int;
  v_key text;
  v_claimed uuid;
  v_version int;
  c_max_cycles constant int := 3;
BEGIN
  v_score_changed := (NEW.home_score IS DISTINCT FROM OLD.home_score)
                  OR (NEW.away_score IS DISTINCT FROM OLD.away_score);
  v_ht_changed := (NEW.home_score_ht IS DISTINCT FROM OLD.home_score_ht)
               OR (NEW.away_score_ht IS DISTINCT FROM OLD.away_score_ht);
  IF NOT (v_score_changed OR v_ht_changed) THEN RETURN NEW; END IF;
  IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS DISTINCT FROM 'finished'::public.match_status THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.predictions
    WHERE match_id = NEW.id
      AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status)
  ) INTO v_has_settled;
  IF NOT v_has_settled THEN RETURN NEW; END IF;

  v_basis := NEW.home_score || '-' || NEW.away_score || ':ht:'
          || COALESCE(NEW.home_score_ht::text,'x') || '-' || COALESCE(NEW.away_score_ht::text,'x');

  v_version := public.settlement_next_version('football_match', NEW.id, 'resettle');

  -- Count how many times this exact score basis already drove a resettle.
  SELECT COUNT(*) INTO v_cycles
  FROM public.settlement_journal
  WHERE product = 'football_match' AND reference_id = NEW.id
    AND metadata->>'score_basis' = v_basis;

  IF v_cycles >= c_max_cycles THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, reason)
    VALUES (NULL, 'match.score_resettle_cycle_capped', 'matches', NEW.id,
      jsonb_build_object('score_basis', v_basis, 'cycles', v_cycles),
      'Score basis re-settled too many times; provider flapping suppressed');
    RETURN NEW;
  END IF;

  -- Key includes the settlement version, so a legitimate A -> B -> A regrade is
  -- a NEW version and is allowed; a duplicate of the SAME version is not.
  v_key := 'football_match:' || NEW.id::text || ':v' || v_version || ':' || v_basis;

  INSERT INTO public.settlement_journal(
    product, reference_id, settlement_version, settlement_action, idempotency_key,
    previous_status, final_status, metadata)
  VALUES ('football_match', NEW.id, v_version, 'resettle', v_key,
    COALESCE(OLD.home_score::text,'?')||'-'||COALESCE(OLD.away_score::text,'?'),
    NEW.home_score::text||'-'||NEW.away_score::text,
    jsonb_build_object('trigger','matches_score_change_guard','score_basis',v_basis))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, reason)
    VALUES (NULL, 'match.score_resettle_skipped_duplicate', 'matches', NEW.id,
      jsonb_build_object('idempotency_key', v_key),
      'This settlement version was already recorded; duplicate suppressed');
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
      'idempotency_key', v_key,
      'settlement_version', v_version,
      'score_basis', v_basis,
      'reversed', v_reversed,
      'resettled', v_resettled),
    'Score changed after settlement; predictions auto-reversed and re-settled');

  RETURN NEW;
END $$;

-- 6. Test-only helper: force a failure after a claim in the same transaction
CREATE OR REPLACE FUNCTION public.settlement_claim_then_fail(
  p_product text, p_reference_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.settlement_claim(p_product, p_reference_id, 'settle', 'pending', 'won');
  IF v_id IS NULL THEN RAISE EXCEPTION 'claim unexpectedly refused'; END IF;
  RAISE EXCEPTION 'FORCED_FAILURE_AFTER_CLAIM';
END $$;
REVOKE ALL ON FUNCTION public.settlement_claim_then_fail(text,uuid) FROM PUBLIC, anon, authenticated;