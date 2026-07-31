
-- ============================================================
-- PHASE 3: Unified accounting foundation (shadow mode)
-- ============================================================

CREATE TYPE public.acct_account_type AS ENUM (
  'LIABILITY','ASSET','EQUITY','REVENUE','EXPENSE','HOUSE_RESERVE','SUSPENSE'
);
CREATE TYPE public.acct_normal_balance AS ENUM ('DEBIT','CREDIT');
CREATE TYPE public.acct_account_status AS ENUM ('ACTIVE','CLOSED','SUSPENDED');
CREATE TYPE public.acct_journal_status AS ENUM ('DRAFT','POSTED','REVERSED','REJECTED');
CREATE TYPE public.acct_journal_type AS ENUM (
  'OPENING_BALANCE','STAKE_PLACED','PAYOUT_SETTLED','REFUND','VOID','REVERSAL',
  'BONUS_GRANT','POINTS_EXPIRY','ADMIN_CORRECTION','MIGRATION_CORRECTION',
  'ROUNDING','LEGACY_BACKFILL_REFERENCE','TEST'
);
CREATE TYPE public.acct_cutover_status AS ENUM (
  'DRAFT','VALIDATED','APPROVED','OPENING_POSTED','CANCELLED'
);

-- Immutable, non-timestamp-derived ledger sequence
CREATE SEQUENCE public.accounting_ledger_seq AS bigint START 1 INCREMENT 1 NO CYCLE;

-- ------------------------------------------------------------
-- Cutover batches
-- ------------------------------------------------------------
CREATE TABLE public.accounting_cutover_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cutover_timestamp timestamptz NOT NULL DEFAULT now(),
  status public.acct_cutover_status NOT NULL DEFAULT 'DRAFT',
  live_bankroll_balance numeric(18,2) NOT NULL,
  reconstructed_bankroll_balance numeric(18,2),
  pending_correction_amount numeric(18,2) NOT NULL DEFAULT 0,
  pending_correction_reference uuid,
  total_user_wallet_balance numeric(18,2) NOT NULL,
  user_count integer NOT NULL,
  open_sports_stakes numeric(18,2) NOT NULL DEFAULT 0,
  open_arcade_stakes numeric(18,2) NOT NULL DEFAULT 0,
  open_gross_payout_exposure numeric(18,2) NOT NULL DEFAULT 0,
  open_reserved_liability numeric(18,2) NOT NULL DEFAULT 0,
  legacy_ledger_last_sequence bigint,
  snapshot_hash text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.accounting_cutover_batches TO service_role;
ALTER TABLE public.accounting_cutover_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cutover_no_client_access" ON public.accounting_cutover_batches
  FOR SELECT TO authenticated USING (false);

-- ------------------------------------------------------------
-- Chart of accounts
-- ------------------------------------------------------------
CREATE TABLE public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL,
  account_type public.acct_account_type NOT NULL,
  normal_balance public.acct_normal_balance NOT NULL,
  user_id uuid,
  product text,
  environment text NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production','simulation','test')),
  currency_or_unit text NOT NULL DEFAULT 'POINTS',
  status public.acct_account_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- Exactly one ACTIVE wallet account per user
CREATE UNIQUE INDEX accounting_accounts_one_active_wallet
  ON public.accounting_accounts (user_id)
  WHERE account_code = 'USER_WALLET' AND status = 'ACTIVE';
-- Exactly one ACTIVE production house bankroll
CREATE UNIQUE INDEX accounting_accounts_one_active_house
  ON public.accounting_accounts (account_code, environment)
  WHERE account_code = 'HOUSE_BANKROLL' AND status = 'ACTIVE';
-- Non-user singleton accounts unique per code+environment
CREATE UNIQUE INDEX accounting_accounts_singleton_codes
  ON public.accounting_accounts (account_code, environment)
  WHERE user_id IS NULL AND status = 'ACTIVE';
CREATE INDEX accounting_accounts_user_idx ON public.accounting_accounts (user_id);

GRANT SELECT ON public.accounting_accounts TO authenticated;
GRANT ALL ON public.accounting_accounts TO service_role;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_select_own" ON public.accounting_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- Journals
-- ------------------------------------------------------------
CREATE TABLE public.accounting_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL UNIQUE,
  ledger_seq bigint NOT NULL UNIQUE,
  journal_type public.acct_journal_type NOT NULL,
  product text,
  game text,
  reference_type text,
  reference_id text,
  event_type text,
  settlement_version integer,
  idempotency_key text NOT NULL UNIQUE,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status public.acct_journal_status NOT NULL DEFAULT 'DRAFT',
  reversal_of_journal_id uuid REFERENCES public.accounting_journals(id),
  reversed_by_journal_id uuid REFERENCES public.accounting_journals(id),
  cutover_batch_id uuid REFERENCES public.accounting_cutover_batches(id),
  created_by uuid,
  approved_by uuid,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX accounting_journals_one_reversal
  ON public.accounting_journals (reversal_of_journal_id)
  WHERE reversal_of_journal_id IS NOT NULL;
CREATE INDEX accounting_journals_ref_idx ON public.accounting_journals (reference_type, reference_id);
CREATE INDEX accounting_journals_seq_idx ON public.accounting_journals (ledger_seq);

GRANT SELECT ON public.accounting_journals TO authenticated;
GRANT ALL ON public.accounting_journals TO service_role;
ALTER TABLE public.accounting_journals ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Journal lines
-- ------------------------------------------------------------
CREATE TABLE public.accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.accounting_journals(id),
  line_number integer NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id),
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  signed_effect numeric(18,2) NOT NULL,
  balance_before numeric(18,2) NOT NULL,
  balance_after numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT acct_line_one_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT acct_line_unique_number UNIQUE (journal_id, line_number)
);
CREATE INDEX accounting_journal_lines_account_idx ON public.accounting_journal_lines (account_id);

GRANT SELECT ON public.accounting_journal_lines TO authenticated;
GRANT ALL ON public.accounting_journal_lines TO service_role;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lines_select_own" ON public.accounting_journal_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.accounting_accounts a
            WHERE a.id = accounting_journal_lines.account_id AND a.user_id = auth.uid())
  );
CREATE POLICY "journals_select_own" ON public.accounting_journals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.accounting_journal_lines l
            JOIN public.accounting_accounts a ON a.id = l.account_id
            WHERE l.journal_id = accounting_journals.id AND a.user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Materialised account balances
-- ------------------------------------------------------------
CREATE TABLE public.accounting_account_balances (
  account_id uuid PRIMARY KEY REFERENCES public.accounting_accounts(id),
  balance numeric(18,2) NOT NULL DEFAULT 0,
  last_ledger_seq bigint,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accounting_account_balances TO authenticated;
GRANT ALL ON public.accounting_account_balances TO service_role;
ALTER TABLE public.accounting_account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balances_select_own" ON public.accounting_account_balances
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.accounting_accounts a
            WHERE a.id = accounting_account_balances.account_id AND a.user_id = auth.uid())
  );

-- Auto-create balance row for every account
CREATE OR REPLACE FUNCTION public.accounting_account_balance_seed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.accounting_account_balances (account_id) VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_accounts_seed_balance
  AFTER INSERT ON public.accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounting_account_balance_seed();

-- ------------------------------------------------------------
-- Internal-write guard helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_internal_ctx()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('accounting.internal', true), 'off') = 'on'
$$;

CREATE OR REPLACE FUNCTION public.accounting_caller_authorised()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  r := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
                '');
  IF r = 'service_role' THEN RETURN true; END IF;
  IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN true; END IF;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN current_user IN ('postgres','supabase_admin','service_role');
END $$;

-- Immutability: posted journals & lines & balances
CREATE OR REPLACE FUNCTION public.accounting_journal_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'POSTED' OR OLD.status = 'REVERSED' THEN
      RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: posted journals cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('POSTED','REVERSED') THEN
    IF NOT public.accounting_internal_ctx() THEN
      RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: posted journal % cannot be modified', OLD.journal_number;
    END IF;
    -- even internally, only the reversal linkage/status may change
    IF NEW.ledger_seq IS DISTINCT FROM OLD.ledger_seq
       OR NEW.journal_number IS DISTINCT FROM OLD.journal_number
       OR NEW.journal_type IS DISTINCT FROM OLD.journal_type
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
       OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
       OR NEW.product IS DISTINCT FROM OLD.product
       OR NEW.cutover_batch_id IS DISTINCT FROM OLD.cutover_batch_id THEN
      RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: immutable journal field changed on %', OLD.journal_number;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_journals_immutable
  BEFORE UPDATE OR DELETE ON public.accounting_journals
  FOR EACH ROW EXECUTE FUNCTION public.accounting_journal_immutable();

CREATE OR REPLACE FUNCTION public.accounting_line_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st public.acct_journal_status;
BEGIN
  SELECT status INTO st FROM public.accounting_journals
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.accounting_internal_ctx() THEN
      RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: journal lines may only be written by accounting_post_journal()';
    END IF;
    RETURN NEW;
  END IF;
  IF st IN ('POSTED','REVERSED') THEN
    RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: lines of a posted journal cannot be changed or deleted';
  END IF;
  IF NOT public.accounting_internal_ctx() THEN
    RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: journal lines may only be written by accounting_post_journal()';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER accounting_journal_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.accounting_line_immutable();

CREATE OR REPLACE FUNCTION public.accounting_balance_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.accounting_internal_ctx() THEN
    RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: account balances may only be changed by accounting_post_journal()';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_account_balances_guard
  BEFORE UPDATE OR DELETE ON public.accounting_account_balances
  FOR EACH ROW EXECUTE FUNCTION public.accounting_balance_guard();

-- Cutover immutability after approval
CREATE OR REPLACE FUNCTION public.accounting_cutover_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('APPROVED','OPENING_POSTED','CANCELLED') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND OLD.status = 'APPROVED' AND NEW.status = 'OPENING_POSTED'
       AND NEW.snapshot_hash = OLD.snapshot_hash
       AND NEW.live_bankroll_balance = OLD.live_bankroll_balance
       AND NEW.snapshot = OLD.snapshot THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: cutover batch is frozen after approval';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_cutover_batches_guard
  BEFORE UPDATE ON public.accounting_cutover_batches
  FOR EACH ROW EXECUTE FUNCTION public.accounting_cutover_guard();

-- ------------------------------------------------------------
-- Canonical posting function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_post_journal(
  p_journal_type text,
  p_lines jsonb,
  p_idempotency_key text,
  p_product text DEFAULT NULL,
  p_game text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_settlement_version integer DEFAULT NULL,
  p_effective_at timestamptz DEFAULT now(),
  p_cutover_batch_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_reversal_of uuid DEFAULT NULL,
  p_allow_negative boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.accounting_journals%ROWTYPE;
  v_seq bigint;
  v_journal_id uuid;
  v_journal_no text;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_line jsonb;
  v_count int := 0;
  v_acct public.accounting_accounts%ROWTYPE;
  v_before numeric(18,2);
  v_after numeric(18,2);
  v_effect numeric(18,2);
  v_debit numeric;
  v_credit numeric;
  v_results jsonb := '[]'::jsonb;
  v_ids uuid[];
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post journals';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: idempotency_key required (min 8 chars)';
  END IF;

  SELECT * INTO v_existing FROM public.accounting_journals
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'idempotent', true, 'journal_id', v_existing.id,
      'journal_number', v_existing.journal_number,
      'ledger_seq', v_existing.ledger_seq, 'status', v_existing.status);
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a posted journal requires at least two lines';
  END IF;

  -- validate lines & collect accounts
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: negative amounts are not allowed';
    END IF;
    IF (v_debit > 0 AND v_credit > 0) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: a line cannot carry both a debit and a credit';
    END IF;
    IF (v_debit = 0 AND v_credit = 0) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: a line must carry a debit or credit greater than zero';
    END IF;
    IF v_debit <> round(v_debit, 2) OR v_credit <> round(v_credit, 2) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: amounts must use 2-decimal fixed precision';
    END IF;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
    v_ids := array_append(v_ids, (v_line->>'account_id')::uuid);
  END LOOP;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'ACCOUNTING_UNBALANCED: debits % <> credits %', v_total_debit, v_total_credit;
  END IF;

  PERFORM set_config('accounting.internal', 'on', true);

  -- deterministic lock order
  PERFORM 1 FROM public.accounting_account_balances b
    WHERE b.account_id = ANY(v_ids)
    ORDER BY b.account_id
    FOR UPDATE;

  v_seq := nextval('public.accounting_ledger_seq');
  v_journal_no := 'J' || lpad(v_seq::text, 10, '0');

  INSERT INTO public.accounting_journals (
    journal_number, ledger_seq, journal_type, product, game, reference_type, reference_id,
    event_type, settlement_version, idempotency_key, effective_at, status,
    reversal_of_journal_id, cutover_batch_id, created_by, approved_by, correlation_id, metadata)
  VALUES (
    v_journal_no, v_seq, p_journal_type::public.acct_journal_type, p_product, p_game,
    p_reference_type, p_reference_id, p_event_type, p_settlement_version, p_idempotency_key,
    p_effective_at, 'DRAFT', p_reversal_of, p_cutover_batch_id, p_created_by, p_approved_by,
    p_correlation_id, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_count := v_count + 1;
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);

    SELECT * INTO v_acct FROM public.accounting_accounts
      WHERE id = (v_line->>'account_id')::uuid;
    IF NOT FOUND OR v_acct.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: account % missing or inactive', v_line->>'account_id';
    END IF;

    SELECT balance INTO v_before FROM public.accounting_account_balances
      WHERE account_id = v_acct.id FOR UPDATE;

    IF v_acct.normal_balance = 'CREDIT' THEN
      v_effect := v_credit - v_debit;
    ELSE
      v_effect := v_debit - v_credit;
    END IF;
    v_after := v_before + v_effect;

    IF v_after < 0 AND NOT p_allow_negative
       AND v_acct.account_code IN ('USER_WALLET') THEN
      RAISE EXCEPTION 'ACCOUNTING_INSUFFICIENT_FUNDS: account % would go negative (% -> %)',
        v_acct.account_code, v_before, v_after;
    END IF;

    INSERT INTO public.accounting_journal_lines (
      journal_id, line_number, account_id, debit, credit, signed_effect,
      balance_before, balance_after, metadata)
    VALUES (v_journal_id, v_count, v_acct.id, v_debit, v_credit, v_effect,
      v_before, v_after, coalesce(v_line->'metadata', '{}'::jsonb));

    UPDATE public.accounting_account_balances
       SET balance = v_after, last_ledger_seq = v_seq, version = version + 1, updated_at = now()
     WHERE account_id = v_acct.id;

    v_results := v_results || jsonb_build_object(
      'account_id', v_acct.id, 'account_code', v_acct.account_code, 'balance_after', v_after);
  END LOOP;

  UPDATE public.accounting_journals SET status = 'POSTED' WHERE id = v_journal_id;

  PERFORM set_config('accounting.internal', 'off', true);

  RETURN jsonb_build_object(
    'idempotent', false,
    'journal_id', v_journal_id,
    'journal_number', v_journal_no,
    'ledger_seq', v_seq,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'balances', v_results);
END $$;

REVOKE ALL ON FUNCTION public.accounting_post_journal(text,jsonb,text,text,text,text,text,text,integer,timestamptz,uuid,uuid,uuid,uuid,jsonb,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_post_journal(text,jsonb,text,text,text,text,text,text,integer,timestamptz,uuid,uuid,uuid,uuid,jsonb,uuid,boolean) TO service_role;

-- ------------------------------------------------------------
-- Reversal function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_reverse_journal(
  p_journal_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_created_by uuid DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.accounting_journals%ROWTYPE;
  v_lines jsonb;
  v_res jsonb;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may reverse journals';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a reversal reason is required';
  END IF;

  SELECT * INTO j FROM public.accounting_journals WHERE id = p_journal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_INVALID: journal not found'; END IF;
  IF j.status <> 'POSTED' THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: only a POSTED journal can be reversed (status %)', j.status;
  END IF;
  IF j.reversed_by_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_ALREADY_REVERSED: journal % already reversed', j.journal_number;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'account_id', l.account_id,
      'debit', l.credit,
      'credit', l.debit,
      'metadata', jsonb_build_object('reverses_line', l.line_number))
      ORDER BY l.line_number)
    INTO v_lines
  FROM public.accounting_journal_lines l WHERE l.journal_id = j.id;

  v_res := public.accounting_post_journal(
    p_journal_type := 'REVERSAL',
    p_lines := v_lines,
    p_idempotency_key := p_idempotency_key,
    p_product := j.product,
    p_game := j.game,
    p_reference_type := j.reference_type,
    p_reference_id := j.reference_id,
    p_event_type := 'REVERSAL',
    p_created_by := p_created_by,
    p_approved_by := p_approved_by,
    p_correlation_id := j.correlation_id,
    p_metadata := jsonb_build_object('reason', p_reason, 'reverses', j.journal_number),
    p_reversal_of := j.id,
    p_allow_negative := true);

  PERFORM set_config('accounting.internal', 'on', true);
  UPDATE public.accounting_journals
     SET status = 'REVERSED', reversed_by_journal_id = (v_res->>'journal_id')::uuid
   WHERE id = j.id;
  PERFORM set_config('accounting.internal', 'off', true);

  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.accounting_reverse_journal(uuid,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_reverse_journal(uuid,text,text,uuid,uuid) TO service_role;

-- ------------------------------------------------------------
-- Read-only views
-- ------------------------------------------------------------
CREATE VIEW public.v_accounting_journals AS
SELECT j.journal_number, j.ledger_seq, j.journal_type, j.product, j.game, j.event_type,
       j.reference_type, j.reference_id,
       coalesce(sum(l.debit),0) AS total_debit,
       coalesce(sum(l.credit),0) AS total_credit,
       j.status, j.effective_at, j.reversal_of_journal_id, j.reversed_by_journal_id, j.id
FROM public.accounting_journals j
LEFT JOIN public.accounting_journal_lines l ON l.journal_id = j.id
GROUP BY j.id;

CREATE VIEW public.v_accounting_account_activity AS
SELECT a.account_code, a.id AS account_id, a.user_id, j.ledger_seq, j.journal_number,
       l.debit, l.credit, l.signed_effect, l.balance_before, l.balance_after, j.effective_at, j.status
FROM public.accounting_journal_lines l
JOIN public.accounting_journals j ON j.id = l.journal_id
JOIN public.accounting_accounts a ON a.id = l.account_id;

CREATE VIEW public.v_accounting_balance_reconstruction AS
SELECT a.id AS account_id, a.account_code, a.user_id,
       b.balance AS materialised_balance,
       coalesce(sum(CASE WHEN a.normal_balance = 'CREDIT' THEN l.credit - l.debit
                         ELSE l.debit - l.credit END), 0) AS journal_derived_balance,
       b.balance - coalesce(sum(CASE WHEN a.normal_balance = 'CREDIT' THEN l.credit - l.debit
                         ELSE l.debit - l.credit END), 0) AS variance,
       b.last_ledger_seq AS last_materialised_seq,
       max(j.ledger_seq) AS last_journal_seq,
       CASE WHEN b.balance = coalesce(sum(CASE WHEN a.normal_balance = 'CREDIT' THEN l.credit - l.debit
                         ELSE l.debit - l.credit END), 0) THEN 'OK' ELSE 'DRIFT' END AS reconciliation_status
FROM public.accounting_accounts a
JOIN public.accounting_account_balances b ON b.account_id = a.id
LEFT JOIN public.accounting_journal_lines l ON l.account_id = a.id
LEFT JOIN public.accounting_journals j ON j.id = l.journal_id AND j.status IN ('POSTED','REVERSED')
GROUP BY a.id, a.account_code, a.user_id, b.balance, b.last_ledger_seq;

CREATE VIEW public.v_accounting_trial_balance AS
SELECT a.account_code, a.account_type, a.environment,
       coalesce(sum(l.debit),0) AS debit_total,
       coalesce(sum(l.credit),0) AS credit_total,
       coalesce(sum(b.balance),0) AS closing_balance
FROM public.accounting_accounts a
JOIN public.accounting_account_balances b ON b.account_id = a.id
LEFT JOIN public.accounting_journal_lines l ON l.account_id = a.id
GROUP BY a.account_code, a.account_type, a.environment;

CREATE VIEW public.v_accounting_cutover_status AS
SELECT c.id AS cutover_batch_id, c.status, c.cutover_timestamp, c.snapshot_hash,
       oj.journal_number AS opening_journal_number, oj.ledger_seq AS opening_ledger_seq,
       c.live_bankroll_balance, c.reconstructed_bankroll_balance,
       c.pending_correction_amount, c.pending_correction_reference,
       (SELECT count(*) FROM public.accounting_accounts a WHERE a.status = 'ACTIVE') AS account_count,
       (SELECT coalesce(sum(l.credit),0) FROM public.accounting_journal_lines l WHERE l.journal_id = oj.id) AS opening_total,
       (SELECT coalesce(sum(abs(v.variance)),0) FROM public.v_accounting_balance_reconstruction v) AS reconstruction_variance
FROM public.accounting_cutover_batches c
LEFT JOIN public.accounting_journals oj
  ON oj.cutover_batch_id = c.id AND oj.journal_type = 'OPENING_BALANCE';

-- User-facing restricted view
CREATE VIEW public.v_my_accounting_activity
WITH (security_invoker = on) AS
SELECT a.account_code, j.ledger_seq, j.journal_number, j.journal_type, j.product,
       l.debit, l.credit, l.signed_effect, l.balance_after, j.effective_at
FROM public.accounting_journal_lines l
JOIN public.accounting_journals j ON j.id = l.journal_id
JOIN public.accounting_accounts a ON a.id = l.account_id
WHERE a.user_id = auth.uid();

REVOKE ALL ON public.v_accounting_journals, public.v_accounting_account_activity,
  public.v_accounting_balance_reconstruction, public.v_accounting_trial_balance,
  public.v_accounting_cutover_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_accounting_journals, public.v_accounting_account_activity,
  public.v_accounting_balance_reconstruction, public.v_accounting_trial_balance,
  public.v_accounting_cutover_status TO service_role;
GRANT SELECT ON public.v_my_accounting_activity TO authenticated;

-- ------------------------------------------------------------
-- Seed chart of accounts (no balances posted here)
-- ------------------------------------------------------------
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, environment, metadata)
VALUES
  ('HOUSE_BANKROLL','HOUSE_RESERVE','CREDIT','production','{"legacy_ref":"platform_bankroll.id=1"}'),
  ('HOUSE_BANKROLL','HOUSE_RESERVE','CREDIT','simulation','{"legacy_ref":"platform_bankroll.id=2"}'),
  ('LEGACY_OPENING_SOURCE','EQUITY','DEBIT','production','{}'),
  ('BONUS_EXPENSE','EXPENSE','DEBIT','production','{}'),
  ('POINTS_ISSUANCE','EQUITY','DEBIT','production','{}'),
  ('POINTS_EXPIRY','REVENUE','CREDIT','production','{}'),
  ('ROUNDING_ADJUSTMENT','EXPENSE','DEBIT','production','{}'),
  ('ADMIN_ADJUSTMENT','EQUITY','DEBIT','production','{}'),
  ('MIGRATION_ADJUSTMENT','EQUITY','DEBIT','production','{}'),
  ('MATCH_STAKE_POOL_LEGACY','LIABILITY','CREDIT','production','{}');

-- One ACTIVE USER_WALLET account per existing wallet holder
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, user_id, environment, metadata)
SELECT 'USER_WALLET','LIABILITY','CREDIT', w.user_id, 'production',
       jsonb_build_object('legacy_wallet_user_id', w.user_id)
FROM public.wallets w;
