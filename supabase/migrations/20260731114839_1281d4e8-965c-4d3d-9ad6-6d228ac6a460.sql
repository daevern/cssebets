-- =========================================================
-- PHASE 2: Historical reconciliation & accounting integrity
-- =========================================================

-- ---------- A. BLACKJACK IMMUTABILITY ----------

CREATE OR REPLACE FUNCTION public.arcade_bj_is_terminal(p_status public.bj_hand_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('COMPLETED','VOID','REVERSED','EXPIRED');
$$;

CREATE OR REPLACE FUNCTION public.arcade_bj_hands_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k text[] := ARRAY['result','total_stake','total_payout','user_net','total_score_awarded',
                    'dealer_total','dealer_soft','dealer_bust','dealer_blackjack',
                    'rule_config_id','rule_version','score_config_id','score_version',
                    'server_seed_hash','client_seed','nonce','user_id','shoe_id','settled_at'];
  old_fp jsonb; new_fp jsonb;
BEGIN
  IF NOT public.arcade_bj_is_terminal(OLD.status) OR OLD.settled_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('app.bj_reversal', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT jsonb_object_agg(key, value) INTO old_fp FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY(k);
  SELECT jsonb_object_agg(key, value) INTO new_fp FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY(k);

  IF old_fp IS DISTINCT FROM new_fp OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'BJ_SETTLEMENT_IMMUTABLE: hand % is settled (%); use arcade_bj_reverse_settlement()',
      OLD.id, OLD.status USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS arcade_bj_hands_immutable_trg ON public.arcade_bj_hands;
CREATE TRIGGER arcade_bj_hands_immutable_trg
BEFORE UPDATE ON public.arcade_bj_hands
FOR EACH ROW EXECUTE FUNCTION public.arcade_bj_hands_immutable();

CREATE OR REPLACE FUNCTION public.arcade_bj_child_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hand uuid; v_status public.bj_hand_status; v_settled timestamptz;
BEGIN
  v_hand := CASE WHEN TG_OP = 'DELETE' THEN OLD.hand_id ELSE NEW.hand_id END;
  IF v_hand IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  SELECT status, settled_at INTO v_status, v_settled FROM public.arcade_bj_hands WHERE id = v_hand;
  IF v_status IS NOT NULL AND public.arcade_bj_is_terminal(v_status) AND v_settled IS NOT NULL
     AND coalesce(current_setting('app.bj_reversal', true), '') <> '1' THEN
    RAISE EXCEPTION 'BJ_SETTLEMENT_IMMUTABLE: % on %.% blocked for settled hand %',
      TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME, v_hand USING ERRCODE = 'raise_exception';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS arcade_bj_player_hands_immutable_trg ON public.arcade_bj_player_hands;
CREATE TRIGGER arcade_bj_player_hands_immutable_trg
BEFORE UPDATE OR DELETE ON public.arcade_bj_player_hands
FOR EACH ROW EXECUTE FUNCTION public.arcade_bj_child_immutable();

DROP TRIGGER IF EXISTS arcade_bj_cards_immutable_trg ON public.arcade_bj_cards;
CREATE TRIGGER arcade_bj_cards_immutable_trg
BEFORE UPDATE OR DELETE ON public.arcade_bj_cards
FOR EACH ROW EXECUTE FUNCTION public.arcade_bj_child_immutable();

-- Admin-only reversal path (the ONLY way to unwind a settled hand)
CREATE OR REPLACE FUNCTION public.arcade_bj_reverse_settlement(
  p_hand uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  h public.arcade_bj_hands; w public.wallets;
  v_admin uuid := auth.uid(); v_delta numeric(14,2); v_before numeric(14,2); v_after numeric(14,2);
  v_version int; v_claim uuid; v_score int;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF h.status <> 'COMPLETED' THEN RAISE EXCEPTION 'NOT_REVERSIBLE: status %', h.status; END IF;

  v_version := public.settlement_next_version('blackjack', p_hand, 'reverse');
  v_claim := public.settlement_claim('blackjack', p_hand, 'reverse', h.status::text, 'REVERSED',
              h.user_id, h.total_payout, jsonb_build_object('reason', p_reason, 'admin', v_admin), v_version);

  -- restore wallet to pre-hand state: give back stake, claw back payout
  v_delta := coalesce(h.total_stake,0) - coalesce(h.total_payout,0);
  IF v_delta <> 0 THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = h.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (h.user_id, 0) RETURNING * INTO w;
    END IF;
    v_before := w.balance; v_after := v_before + v_delta;
    UPDATE public.wallets SET balance = v_after WHERE user_id = h.user_id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category)
    VALUES (h.user_id, CASE WHEN v_delta > 0 THEN 'refund' ELSE 'adjustment' END, abs(v_delta),
      v_before, v_after, 'admin_adjustment', p_hand,
      'Blackjack settlement reversal: '||p_reason, 'arcade_blackjack');
  END IF;

  -- reverse awarded score
  v_score := coalesce(h.total_score_awarded, 0);
  IF v_score <> 0 THEN
    UPDATE public.arcade_bj_score_balances
       SET total_score = greatest(0, total_score - v_score)
     WHERE user_id = h.user_id;
  END IF;

  PERFORM set_config('app.bj_reversal', '1', true);
  UPDATE public.arcade_bj_hands
     SET status = 'REVERSED', resolved_by = v_admin, resolution_reason = p_reason, updated_at = now()
   WHERE id = p_hand;
  UPDATE public.arcade_bj_player_hands SET status = 'REVERSED' WHERE hand_id = p_hand;
  PERFORM set_config('app.bj_reversal', '0', true);

  PERFORM public.create_audit_log('blackjack.settlement_reversed','arcade_bj_hands', p_hand, v_admin, h.user_id,
    jsonb_build_object('status', h.status, 'result', h.result, 'total_payout', h.total_payout,
                       'total_stake', h.total_stake, 'score', v_score),
    jsonb_build_object('status','REVERSED','wallet_delta', v_delta, 'settlement_version', v_version),
    jsonb_build_object('claim_id', v_claim), p_reason);

  RETURN jsonb_build_object('ok', true, 'hand_id', p_hand, 'wallet_delta', v_delta,
                            'settlement_version', v_version);
END $$;

REVOKE ALL ON FUNCTION public.arcade_bj_reverse_settlement(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.arcade_bj_reverse_settlement(uuid, text) TO authenticated, service_role;

-- ---------- B. DETERMINISTIC LEDGER ORDERING ----------

CREATE SEQUENCE IF NOT EXISTS public.platform_transactions_seq;
CREATE SEQUENCE IF NOT EXISTS public.wallet_transactions_seq;

ALTER TABLE public.platform_transactions ADD COLUMN IF NOT EXISTS ledger_seq bigint;
ALTER TABLE public.wallet_transactions   ADD COLUMN IF NOT EXISTS ledger_seq bigint;

WITH o AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) rn FROM public.platform_transactions
)
UPDATE public.platform_transactions t SET ledger_seq = o.rn FROM o WHERE o.id = t.id AND t.ledger_seq IS NULL;

WITH o AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) rn FROM public.wallet_transactions
)
UPDATE public.wallet_transactions t SET ledger_seq = o.rn FROM o WHERE o.id = t.id AND t.ledger_seq IS NULL;

SELECT setval('public.platform_transactions_seq',
  greatest(1, coalesce((SELECT max(ledger_seq) FROM public.platform_transactions), 0)));
SELECT setval('public.wallet_transactions_seq',
  greatest(1, coalesce((SELECT max(ledger_seq) FROM public.wallet_transactions), 0)));

ALTER TABLE public.platform_transactions ALTER COLUMN ledger_seq SET DEFAULT nextval('public.platform_transactions_seq');
ALTER TABLE public.wallet_transactions   ALTER COLUMN ledger_seq SET DEFAULT nextval('public.wallet_transactions_seq');

CREATE INDEX IF NOT EXISTS platform_transactions_seq_idx ON public.platform_transactions(ledger_seq);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_seq_idx ON public.wallet_transactions(user_id, ledger_seq);

-- ---------- C. RECONCILIATION REGISTER ----------

CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'platform_bankroll',
  occurred_at timestamptz NOT NULL,
  variance_amount numeric(20,2) NOT NULL,
  classification text NOT NULL CHECK (classification IN (
    'DUPLICATE_SETTLEMENT','SIGN_ERROR','LOST_UPDATE','MISSING_AUDIT_METADATA',
    'TRANSACTION_ORDERING_DEFECT','OPENING_BALANCE_OR_SEED_RESET','UNLEDGERED_BUSINESS_EVENT')),
  is_variance_component boolean NOT NULL DEFAULT true,
  requires_balance_correction boolean NOT NULL DEFAULT false,
  requires_ledger_backfill boolean NOT NULL DEFAULT false,
  requires_reporting_fix boolean NOT NULL DEFAULT false,
  affected_user_id uuid,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative text NOT NULL,
  resolution_status text NOT NULL DEFAULT 'OPEN'
    CHECK (resolution_status IN ('OPEN','EXPLAINED_NO_ACTION','PROPOSAL_RAISED','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_reconciliation_items TO authenticated;
GRANT ALL ON public.accounting_reconciliation_items TO service_role;
ALTER TABLE public.accounting_reconciliation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage reconciliation items" ON public.accounting_reconciliation_items
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER accounting_reconciliation_items_touch BEFORE UPDATE ON public.accounting_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Correction proposals: money only moves after explicit approval
CREATE TABLE IF NOT EXISTS public.accounting_correction_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_item_id uuid REFERENCES public.accounting_reconciliation_items(id) ON DELETE SET NULL,
  scope text NOT NULL DEFAULT 'platform_bankroll',
  proposed_txn_type public.platform_txn_type,
  amount numeric(20,2) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('increase','decrease')),
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','REJECTED','APPLIED')),
  proposed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  applied_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.accounting_correction_proposals TO authenticated;
GRANT ALL ON public.accounting_correction_proposals TO service_role;
ALTER TABLE public.accounting_correction_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage correction proposals" ON public.accounting_correction_proposals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER accounting_correction_proposals_touch BEFORE UPDATE ON public.accounting_correction_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Direct-write log for platform_bankroll
CREATE TABLE IF NOT EXISTS public.platform_bankroll_write_log (
  id bigserial PRIMARY KEY,
  bankroll_id int NOT NULL,
  balance_before numeric(20,2),
  balance_after numeric(20,2),
  txid bigint NOT NULL,
  db_user text NOT NULL,
  app_context text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_bankroll_write_log TO authenticated;
GRANT ALL ON public.platform_bankroll_write_log TO service_role;
ALTER TABLE public.platform_bankroll_write_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bankroll write log" ON public.platform_bankroll_write_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.platform_bankroll_log_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    INSERT INTO public.platform_bankroll_write_log(bankroll_id, balance_before, balance_after, txid, db_user, app_context)
    VALUES (OLD.id, OLD.balance, NEW.balance, txid_current(), current_user,
            coalesce(current_setting('application_name', true), ''));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS platform_bankroll_write_log_trg ON public.platform_bankroll;
CREATE TRIGGER platform_bankroll_write_log_trg
AFTER UPDATE ON public.platform_bankroll
FOR EACH ROW EXECUTE FUNCTION public.platform_bankroll_log_write();

-- ---------- D. SIGN-CORRECT REPORTING VIEWS ----------

CREATE OR REPLACE VIEW public.platform_transactions_signed
WITH (security_invoker = on) AS
SELECT t.id, t.ledger_seq, t.created_at, t.transaction_type, t.amount AS recorded_amount,
       t.balance_before, t.balance_after,
       (t.balance_after - t.balance_before) AS signed_amount,
       CASE WHEN t.balance_after >= t.balance_before THEN 'inflow' ELSE 'outflow' END AS direction,
       (abs(t.balance_after - t.balance_before) <> abs(t.amount)) AS amount_conflict,
       t.bet_id, t.match_id, t.note, t.is_simulation
FROM public.platform_transactions t;

CREATE OR REPLACE VIEW public.wallet_transactions_signed
WITH (security_invoker = on) AS
SELECT w.id, w.ledger_seq, w.created_at, w.user_id, w.type, w.amount AS recorded_amount,
       w.balance_before, w.balance_after,
       (w.balance_after - w.balance_before) AS signed_amount,
       CASE WHEN w.balance_after >= w.balance_before THEN 'credit' ELSE 'debit' END AS direction,
       (abs(w.balance_after - w.balance_before) <> abs(w.amount)) AS amount_conflict,
       (w.type = 'debit' AND w.balance_after > w.balance_before)
         OR (w.type = 'credit' AND w.balance_after < w.balance_before) AS type_direction_conflict,
       w.reference_type, w.reference_id, w.note
FROM public.wallet_transactions w;

GRANT SELECT ON public.platform_transactions_signed, public.wallet_transactions_signed TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_bankroll_reconstruction
WITH (security_invoker = on) AS
WITH l AS (
  SELECT sum(balance_after - balance_before) AS ledger_effect
  FROM public.platform_transactions WHERE coalesce(is_simulation,false) = false
)
SELECT (SELECT balance FROM public.platform_bankroll WHERE id = 1) AS actual_balance,
       (SELECT ledger_effect FROM l) AS reconstructed_balance,
       (SELECT ledger_effect FROM l) - (SELECT balance FROM public.platform_bankroll WHERE id = 1) AS variance,
       (SELECT coalesce(sum(variance_amount),0) FROM public.accounting_reconciliation_items
         WHERE is_variance_component AND scope = 'platform_bankroll') AS explained_variance;

CREATE OR REPLACE VIEW public.v_accounting_reconciliation_summary
WITH (security_invoker = on) AS
SELECT classification,
       count(*) FILTER (WHERE is_variance_component) AS items,
       round(coalesce(sum(variance_amount) FILTER (WHERE is_variance_component),0),2) AS variance_amount,
       count(*) FILTER (WHERE requires_balance_correction) AS needs_balance_correction,
       count(*) FILTER (WHERE requires_ledger_backfill) AS needs_ledger_backfill,
       count(*) FILTER (WHERE requires_reporting_fix) AS needs_reporting_fix
FROM public.accounting_reconciliation_items
GROUP BY classification;

GRANT SELECT ON public.v_bankroll_reconstruction, public.v_accounting_reconciliation_summary TO authenticated, service_role;

-- ---------- E. INTEGRITY SCAN ----------

CREATE OR REPLACE FUNCTION public.accounting_integrity_scan()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', now(),
    'bankroll', (SELECT to_jsonb(r) FROM public.v_bankroll_reconstruction r),
    'unledgered_bankroll_writes', (
      SELECT count(*) FROM public.platform_bankroll_write_log wl
      WHERE NOT EXISTS (
        SELECT 1 FROM public.platform_transactions t
        WHERE t.balance_before = wl.balance_before AND t.balance_after = wl.balance_after
          AND t.created_at BETWEEN wl.created_at - interval '10 seconds' AND wl.created_at + interval '10 seconds')),
    'platform_amount_conflicts', (SELECT count(*) FROM public.platform_transactions_signed WHERE amount_conflict),
    'wallet_amount_conflicts', (SELECT count(*) FROM public.wallet_transactions_signed WHERE amount_conflict),
    'wallet_type_direction_conflicts', (SELECT count(*) FROM public.wallet_transactions_signed WHERE type_direction_conflict),
    'wallet_chain_breaks', (
      SELECT count(*) FROM (
        SELECT user_id, balance_before,
               lag(balance_after) OVER (PARTITION BY user_id ORDER BY ledger_seq) prev
        FROM public.wallet_transactions) s
      WHERE prev IS NOT NULL AND prev <> balance_before),
    'open_reconciliation_items', (SELECT count(*) FROM public.accounting_reconciliation_items WHERE resolution_status = 'OPEN'),
    'pending_correction_proposals', (SELECT count(*) FROM public.accounting_correction_proposals WHERE status IN ('PROPOSED','APPROVED'))
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.accounting_integrity_scan() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accounting_integrity_scan() TO authenticated, service_role;

-- Apply an approved correction (never auto-runs)
CREATE OR REPLACE FUNCTION public.accounting_apply_correction_proposal(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.accounting_correction_proposals; v_new numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
  SELECT * INTO p FROM public.accounting_correction_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF p.status <> 'APPROVED' THEN RAISE EXCEPTION 'PROPOSAL_NOT_APPROVED: %', p.status; END IF;
  IF p.approved_by IS NULL OR p.approved_by = p.proposed_by THEN
    RAISE EXCEPTION 'MAKER_CHECKER_REQUIRED';
  END IF;

  v_new := public.platform_apply_change(
    coalesce(p.proposed_txn_type, CASE WHEN p.direction='increase' THEN 'admin_topup' ELSE 'admin_withdrawal' END)::public.platform_txn_type,
    abs(p.amount), NULL, NULL, 'Accounting correction: '||p.rationale, false);

  UPDATE public.accounting_correction_proposals
     SET status='APPLIED', applied_at=now(),
         applied_result=jsonb_build_object('new_balance', v_new)
   WHERE id = p_id;

  UPDATE public.accounting_reconciliation_items
     SET resolution_status='RESOLVED' WHERE id = p.reconciliation_item_id;

  PERFORM public.create_audit_log('accounting.correction_applied','accounting_correction_proposals', p_id,
    auth.uid(), NULL, to_jsonb(p), jsonb_build_object('new_balance', v_new), '{}'::jsonb, p.rationale);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new);
END $$;

REVOKE ALL ON FUNCTION public.accounting_apply_correction_proposal(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accounting_apply_correction_proposal(uuid) TO authenticated, service_role;