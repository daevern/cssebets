-- Phase 1: emergency settlement idempotency ------------------------------

CREATE TABLE public.settlement_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  reference_id uuid NOT NULL,
  settlement_version integer NOT NULL DEFAULT 1,
  settlement_action text NOT NULL,
  idempotency_key text NOT NULL,
  previous_status text,
  final_status text,
  user_id uuid,
  gross_payout numeric(20,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_journal_action_chk
    CHECK (settlement_action IN ('settle','reverse','regrade','resettle','adjust')),
  CONSTRAINT settlement_journal_unique
    UNIQUE (product, reference_id, settlement_version, settlement_action)
);

CREATE UNIQUE INDEX settlement_journal_idem_key ON public.settlement_journal (idempotency_key);
CREATE INDEX settlement_journal_ref_idx ON public.settlement_journal (product, reference_id);
CREATE INDEX settlement_journal_created_idx ON public.settlement_journal (created_at DESC);

GRANT SELECT ON public.settlement_journal TO authenticated;
GRANT ALL ON public.settlement_journal TO service_role;
ALTER TABLE public.settlement_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settlement journal"
  ON public.settlement_journal FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER settlement_journal_touch
  BEFORE UPDATE ON public.settlement_journal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-product accounting migration flags ---------------------------------
CREATE TABLE public.accounting_migration_flags (
  product text PRIMARY KEY,
  journal_enabled boolean NOT NULL DEFAULT false,
  dual_write boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.accounting_migration_flags TO authenticated;
GRANT ALL ON public.accounting_migration_flags TO service_role;
ALTER TABLE public.accounting_migration_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view accounting flags"
  ON public.accounting_migration_flags FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER accounting_migration_flags_touch
  BEFORE UPDATE ON public.accounting_migration_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.accounting_migration_flags(product, notes) VALUES
  ('plinko','Phase 5 order 1'),
  ('treasure','Phase 5 order 2'),
  ('roulette','Phase 5 order 3'),
  ('blackjack','Phase 5 order 4'),
  ('sports_generic','Phase 5 order 5'),
  ('ufc','Phase 5 order 6'),
  ('f1','Phase 5 order 7'),
  ('football','Phase 5 order 8 (match pool model, migrate last)');

-- Version helper: version N = (completed reversals) + 1 -------------------
CREATE OR REPLACE FUNCTION public.settlement_next_version(p_product text, p_reference_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(COUNT(*), 0)::int + 1
  FROM public.settlement_journal
  WHERE product = p_product AND reference_id = p_reference_id
    AND settlement_action = 'reverse';
$$;

-- Explicit claim helper (used by service code / future phases) ------------
CREATE OR REPLACE FUNCTION public.settlement_claim(
  p_product text,
  p_reference_id uuid,
  p_action text,
  p_previous_status text DEFAULT NULL,
  p_final_status text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_gross_payout numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_version integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version int; v_id uuid;
BEGIN
  v_version := COALESCE(p_version, public.settlement_next_version(p_product, p_reference_id));
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

REVOKE ALL ON FUNCTION public.settlement_claim(text,uuid,text,text,text,uuid,numeric,jsonb,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settlement_next_version(text,uuid) FROM PUBLIC, anon, authenticated;

-- Generic status-transition guard ----------------------------------------
-- TG_ARGV[0] product, [1] status column, [2] terminal statuses (csv),
-- [3] open statuses (csv), [4] reversal statuses reachable from terminal (csv, optional)
CREATE OR REPLACE FUNCTION public.settlement_journal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product  text   := TG_ARGV[0];
  v_col      text   := TG_ARGV[1];
  v_terminal text[] := string_to_array(TG_ARGV[2], ',');
  v_open     text[] := string_to_array(TG_ARGV[3], ',');
  v_revst    text[] := CASE WHEN TG_NARGS > 4 AND COALESCE(TG_ARGV[4],'') <> ''
                            THEN string_to_array(TG_ARGV[4], ',') ELSE ARRAY[]::text[] END;
  v_oldj jsonb := to_jsonb(OLD);
  v_newj jsonb := to_jsonb(NEW);
  v_old text; v_new text; v_action text; v_version int; v_user uuid; v_claim uuid;
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

  v_version := public.settlement_next_version(v_product, (v_newj->>'id')::uuid);

  BEGIN v_user := (v_newj->>'user_id')::uuid; EXCEPTION WHEN OTHERS THEN v_user := NULL; END;

  -- No ON CONFLICT: a duplicate settlement MUST abort the transaction
  -- before any wallet or bankroll movement is committed.
  INSERT INTO public.settlement_journal(
    product, reference_id, settlement_version, settlement_action, idempotency_key,
    previous_status, final_status, user_id, metadata)
  VALUES (
    v_product, (v_newj->>'id')::uuid, v_version, v_action,
    v_product || ':' || (v_newj->>'id') || ':v' || v_version || ':' || v_action,
    v_old, v_new, v_user,
    jsonb_build_object('table', TG_TABLE_NAME, 'status_column', v_col))
  RETURNING id INTO v_claim;

  RETURN NEW;
END $$;

CREATE TRIGGER predictions_settlement_journal
  AFTER UPDATE ON public.predictions FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('football','status','won,lost,void','pending','');

CREATE TRIGGER ufc_bets_settlement_journal
  AFTER UPDATE ON public.ufc_bets FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('ufc','status','won,lost,void,refunded','open,pending','');

CREATE TRIGGER f1_bets_settlement_journal
  AFTER UPDATE ON public.f1_bets FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('f1','status','won,lost,void,refunded','open,pending','');

CREATE TRIGGER sports_bets_settlement_journal
  AFTER UPDATE ON public.sports_bets FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('sports_generic','status','won,lost,void,refunded','pending,open','');

CREATE TRIGGER bj_hands_settlement_journal
  AFTER UPDATE ON public.arcade_bj_hands FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('blackjack','status','COMPLETED,VOID,EXPIRED','CREATED,DEALING,PLAYER_TURN,DEALER_CHECK,DEALER_TURN,SETTLING','REVERSED');

CREATE TRIGGER plinko_settlement_journal
  AFTER UPDATE ON public.arcade_plinko_games FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('plinko','outcome','WIN,LOSS,VOID','PENDING','REVERSED');

CREATE TRIGGER roulette_settlement_journal
  AFTER UPDATE ON public.arcade_roulette_spins FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('roulette','status','WIN,LOSS,PUSH,VOID','PENDING','REVERSED');

CREATE TRIGGER treasure_settlement_journal
  AFTER UPDATE ON public.arcade_treasure_rounds FOR EACH ROW
  EXECUTE FUNCTION public.settlement_journal_guard('treasure','status','WON,LOST,PUSH,VOID,EXPIRED','CREATED,ACTIVE,COLLECTING','REVERSED');

-- Stop the football reverse/re-settle ping-pong ---------------------------
CREATE OR REPLACE FUNCTION public.matches_score_change_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_settled boolean;
  v_reversed int := 0;
  v_resettled int := 0;
  v_score_changed boolean;
  v_ht_changed boolean;
  v_key text;
  v_claimed uuid;
  v_version int;
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

  -- Idempotency on the SCORE BASIS: a given (score, ht score) pair may only
  -- ever drive one reverse+resettle cycle for this match. A provider that
  -- flips A -> B -> A can no longer loop payouts.
  v_key := 'football_match:' || NEW.id::text || ':score:'
        || NEW.home_score || '-' || NEW.away_score || ':ht:'
        || COALESCE(NEW.home_score_ht::text,'x') || '-' || COALESCE(NEW.away_score_ht::text,'x');
  v_version := public.settlement_next_version('football_match', NEW.id);

  INSERT INTO public.settlement_journal(
    product, reference_id, settlement_version, settlement_action, idempotency_key,
    previous_status, final_status, metadata)
  VALUES ('football_match', NEW.id, v_version, 'resettle', v_key,
    COALESCE(OLD.home_score::text,'?')||'-'||COALESCE(OLD.away_score::text,'?'),
    NEW.home_score::text||'-'||NEW.away_score::text,
    jsonb_build_object('trigger','matches_score_change_guard'))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, reason)
    VALUES (NULL, 'match.score_resettle_skipped_duplicate', 'matches', NEW.id,
      jsonb_build_object('idempotency_key', v_key),
      'Score basis already settled once; duplicate re-settlement suppressed');
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
      'reversed', v_reversed,
      'resettled', v_resettled),
    'Score changed after settlement; predictions auto-reversed and re-settled');

  RETURN NEW;
END $$;