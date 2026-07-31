-- ============================================================
-- Phase 3.1 (1/3): environment separation + cross-env guard
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acct_environment') THEN
    CREATE TYPE public.acct_environment AS ENUM ('PRODUCTION','SIMULATION','TEST');
  END IF;
END $$;

-- 1. accounts.environment text -> enum
DROP VIEW IF EXISTS public.v_accounting_trial_balance;
ALTER TABLE public.accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_environment_check;
ALTER TABLE public.accounting_accounts ALTER COLUMN environment DROP DEFAULT;
ALTER TABLE public.accounting_accounts
  ALTER COLUMN environment TYPE public.acct_environment
  USING (CASE upper(environment)
           WHEN 'PRODUCTION' THEN 'PRODUCTION'
           WHEN 'SIMULATION' THEN 'SIMULATION'
           WHEN 'TEST' THEN 'TEST'
           ELSE 'PRODUCTION' END)::public.acct_environment;
ALTER TABLE public.accounting_accounts ALTER COLUMN environment SET DEFAULT 'PRODUCTION';

CREATE VIEW public.v_accounting_trial_balance AS
 SELECT a.account_code,
        a.account_type,
        a.environment,
        COALESCE(sum(l.debit), 0::numeric) AS debit_total,
        COALESCE(sum(l.credit), 0::numeric) AS credit_total,
        COALESCE(sum(b.balance), 0::numeric) AS closing_balance
   FROM public.accounting_accounts a
   JOIN public.accounting_account_balances b ON b.account_id = a.id
   LEFT JOIN public.accounting_journal_lines l ON l.account_id = a.id
  GROUP BY a.account_code, a.account_type, a.environment;
REVOKE ALL ON public.v_accounting_trial_balance FROM PUBLIC;
GRANT SELECT ON public.v_accounting_trial_balance TO service_role;

-- 2. reclassify simulation user wallets (label only, no monetary change)
UPDATE public.accounting_accounts a
   SET environment = 'SIMULATION'
  FROM public.wallets w
 WHERE w.user_id = a.user_id
   AND a.account_code = 'USER_WALLET'
   AND w.is_simulation = true
   AND a.environment <> 'SIMULATION'::public.acct_environment;

-- 3. journals + cutover batches carry an environment
ALTER TABLE public.accounting_journals
  ADD COLUMN IF NOT EXISTS environment public.acct_environment NOT NULL DEFAULT 'PRODUCTION';

ALTER TABLE public.accounting_cutover_batches
  ADD COLUMN IF NOT EXISTS environment public.acct_environment NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.accounting_cutover_batches(id),
  ADD COLUMN IF NOT EXISTS supersede_reason text;

-- 4. cutover guard: allow only the supersede annotation on frozen batches
CREATE OR REPLACE FUNCTION public.accounting_cutover_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF OLD.status IN ('APPROVED','OPENING_POSTED','CANCELLED') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND OLD.status = 'APPROVED' AND NEW.status = 'OPENING_POSTED'
       AND NEW.snapshot_hash = OLD.snapshot_hash
       AND NEW.live_bankroll_balance = OLD.live_bankroll_balance
       AND NEW.snapshot = OLD.snapshot THEN
      RETURN NEW;
    END IF;
    IF NEW.status = OLD.status
       AND OLD.superseded_at IS NULL
       AND NEW.superseded_at IS NOT NULL
       AND NEW.snapshot_hash = OLD.snapshot_hash
       AND NEW.snapshot = OLD.snapshot
       AND NEW.live_bankroll_balance = OLD.live_bankroll_balance
       AND NEW.cutover_timestamp = OLD.cutover_timestamp THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE: cutover batch is frozen after approval';
  END IF;
  RETURN NEW;
END $fn$;

-- 5. environment-specific infrastructure accounts
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, environment, metadata)
SELECT v.code, v.atype::public.acct_account_type, v.nb::public.acct_normal_balance,
       v.env::public.acct_environment,
       jsonb_build_object('phase','3.1','purpose',v.purpose)
FROM (VALUES
  ('LEGACY_OPENING_SOURCE_PRODUCTION','EQUITY','DEBIT','PRODUCTION','environment-scoped opening balance source'),
  ('LEGACY_OPENING_SOURCE_SIMULATION','EQUITY','DEBIT','SIMULATION','environment-scoped opening balance source'),
  ('LEGACY_OPENING_SOURCE_TEST','EQUITY','DEBIT','TEST','environment-scoped opening balance source'),
  ('LEGACY_PRODUCT_CLEARING','SUSPENSE','CREDIT','PRODUCTION','temporary clearing for non-migrated product wallet activity'),
  ('LEGACY_PRODUCT_CLEARING','SUSPENSE','CREDIT','SIMULATION','temporary clearing for non-migrated product wallet activity'),
  ('LEGACY_PRODUCT_CLEARING','SUSPENSE','CREDIT','TEST','temporary clearing for non-migrated product wallet activity'),
  ('PAYOUTS_PAYABLE','LIABILITY','CREDIT','PRODUCTION','accepted but unsettled cash-out payouts owed to users'),
  ('PAYOUTS_PAYABLE','LIABILITY','CREDIT','SIMULATION','accepted but unsettled cash-out payouts owed to users'),
  ('PAYOUTS_PAYABLE','LIABILITY','CREDIT','TEST','accepted but unsettled cash-out payouts owed to users')
) AS v(code, atype, nb, env, purpose)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = v.code
     AND a.environment = v.env::public.acct_environment
     AND a.user_id IS NULL
);

-- 6. posting function: single-environment journals only
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
  p_allow_negative boolean DEFAULT false,
  p_environment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_envs public.acct_environment[];
  v_env public.acct_environment;
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
      'ledger_seq', v_existing.ledger_seq, 'status', v_existing.status,
      'environment', v_existing.environment);
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a posted journal requires at least two lines';
  END IF;

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

  SELECT array_agg(DISTINCT a.environment) INTO v_envs
    FROM public.accounting_accounts a WHERE a.id = ANY(v_ids);
  IF v_envs IS NULL OR array_length(v_envs, 1) IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no valid accounts referenced';
  END IF;
  IF array_length(v_envs, 1) > 1 THEN
    RAISE EXCEPTION 'ACCOUNTING_CROSS_ENVIRONMENT: a journal may not mix environments (%)', v_envs;
  END IF;
  v_env := v_envs[1];
  IF p_environment IS NOT NULL AND upper(p_environment)::public.acct_environment <> v_env THEN
    RAISE EXCEPTION 'ACCOUNTING_CROSS_ENVIRONMENT: declared % but accounts are %', p_environment, v_env;
  END IF;

  PERFORM set_config('accounting.internal', 'on', true);

  PERFORM 1 FROM public.accounting_account_balances b
    WHERE b.account_id = ANY(v_ids)
    ORDER BY b.account_id
    FOR UPDATE;

  v_seq := nextval('public.accounting_ledger_seq');
  v_journal_no := 'J' || lpad(v_seq::text, 10, '0');

  INSERT INTO public.accounting_journals (
    journal_number, ledger_seq, journal_type, product, game, reference_type, reference_id,
    event_type, settlement_version, idempotency_key, effective_at, status,
    reversal_of_journal_id, cutover_batch_id, created_by, approved_by, correlation_id, metadata,
    environment)
  VALUES (
    v_journal_no, v_seq, p_journal_type::public.acct_journal_type, p_product, p_game,
    p_reference_type, p_reference_id, p_event_type, p_settlement_version, p_idempotency_key,
    p_effective_at, 'DRAFT', p_reversal_of, p_cutover_batch_id, p_created_by, p_approved_by,
    p_correlation_id, coalesce(p_metadata, '{}'::jsonb), v_env)
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
    'environment', v_env,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'balances', v_results);
END $fn$;

REVOKE ALL ON FUNCTION public.accounting_post_journal(text,jsonb,text,text,text,text,text,text,integer,timestamptz,uuid,uuid,uuid,uuid,jsonb,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_post_journal(text,jsonb,text,text,text,text,text,text,integer,timestamptz,uuid,uuid,uuid,uuid,jsonb,uuid,boolean,text) TO service_role;

COMMENT ON COLUMN public.accounting_journals.ledger_seq IS
  'Unique, immutable, monotonically increasing ordering key from accounting_ledger_seq. Gaps are EXPECTED (rolled-back or failed postings consume values) and are NOT evidence of tampering.';