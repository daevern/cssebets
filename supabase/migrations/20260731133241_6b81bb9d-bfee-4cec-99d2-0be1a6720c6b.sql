
-- ============ 1. Chart of accounts for treasure / roulette / blackjack ============
INSERT INTO public.accounting_accounts
  (account_code, account_type, normal_balance, environment, status, currency_or_unit, product, metadata)
SELECT c.code, c.atype::acct_account_type, c.nbal::acct_normal_balance, e.env::acct_environment,
       'ACTIVE', 'POINTS', c.product, jsonb_build_object('phase','5a','purpose',c.purpose)
FROM (VALUES
  ('TREASURE_STAKE_REVENUE','REVENUE','CREDIT','treasure','house income from treasure grid stakes'),
  ('TREASURE_PAYOUT_EXPENSE','EXPENSE','DEBIT','treasure','house cost of treasure grid payouts'),
  ('TREASURE_PL_TO_RESERVE','EQUITY','DEBIT','treasure','Treasure realised P/L closed to HOUSE_BANKROLL'),
  ('ROULETTE_STAKE_REVENUE','REVENUE','CREDIT','roulette','house income from roulette stakes'),
  ('ROULETTE_PAYOUT_EXPENSE','EXPENSE','DEBIT','roulette','house cost of roulette returns'),
  ('ROULETTE_PL_TO_RESERVE','EQUITY','DEBIT','roulette','Roulette realised P/L closed to HOUSE_BANKROLL'),
  ('BLACKJACK_STAKE_REVENUE','REVENUE','CREDIT','blackjack','house income from blackjack stakes'),
  ('BLACKJACK_PAYOUT_EXPENSE','EXPENSE','DEBIT','blackjack','house cost of blackjack payouts'),
  ('BLACKJACK_PL_TO_RESERVE','EQUITY','DEBIT','blackjack','Blackjack realised P/L closed to HOUSE_BANKROLL')
) AS c(code, atype, nbal, product, purpose)
CROSS JOIN (VALUES ('PRODUCTION'),('SIMULATION')) AS e(env)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = c.code AND a.environment = e.env::acct_environment AND a.user_id IS NULL
);

-- balance rows are created by the accounting_account_balance_seed trigger on insert

-- ============ 2. Generic arcade posting routine ============
CREATE OR REPLACE FUNCTION public.accounting_post_arcade_settlement(
  p_product text,
  p_ref_type text,
  p_ref_id uuid,
  p_user uuid,
  p_stake numeric,
  p_payout numeric,
  p_effective timestamptz,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_wallet_category text DEFAULT NULL,
  p_wallet_idem text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_env public.acct_environment;
  v_wallet uuid; v_stake_acct uuid; v_payout_acct uuid; v_reserve_acct uuid; v_bankroll_acct uuid;
  v_stake numeric(18,2); v_payout numeric(18,2);
  v_stake_res jsonb := NULL; v_payout_res jsonb := NULL;
  v_prefix text := upper(p_product);
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post arcade journals';
  END IF;
  IF p_product NOT IN ('treasure','roulette','blackjack') THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: unsupported product %', p_product;
  END IF;

  SELECT a.id, a.environment INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', p_user;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_STAKE_REVENUE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_PAYOUT_EXPENSE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_reserve_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_PL_TO_RESERVE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status='ACTIVE';
  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_reserve_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: % accounts missing for environment %', p_product, v_env;
  END IF;

  v_stake  := round(coalesce(p_stake, 0), 2);
  v_payout := round(coalesce(p_payout, 0), 2);

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      p_journal_type := 'STAKE_PLACED',
      p_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_wallet,        'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct,    'debit', 0,       'credit', v_stake),
        jsonb_build_object('account_id', v_reserve_acct,  'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0,       'credit', v_stake)),
      p_idempotency_key := p_product||':'||p_ref_id::text||':stake:v1',
      p_product := p_product, p_game := p_product,
      p_reference_type := p_ref_type,
      p_reference_id := p_ref_id::text,
      p_event_type := 'stake',
      p_settlement_version := 1,
      p_effective_at := coalesce(p_effective, now()),
      p_metadata := p_meta,
      p_environment := v_env::text);
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      p_journal_type := 'PAYOUT_SETTLED',
      p_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct,   'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet,        'debit', 0,        'credit', v_payout),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_reserve_acct,  'debit', 0,        'credit', v_payout)),
      p_idempotency_key := p_product||':'||p_ref_id::text||':payout:v1',
      p_product := p_product, p_game := p_product,
      p_reference_type := p_ref_type,
      p_reference_id := p_ref_id::text,
      p_event_type := 'payout',
      p_settlement_version := 1,
      p_effective_at := coalesce(p_effective, now()),
      p_metadata := p_meta,
      p_environment := v_env::text,
      p_allow_negative := true);
  END IF;

  IF p_wallet_category IS NOT NULL THEN
    UPDATE public.wallet_transactions wt
       SET accounting_sync_status = 'SYNCED',
           accounting_journal_id = CASE WHEN wt.type = 'debit'
                THEN (v_stake_res->>'journal_id')::uuid ELSE (v_payout_res->>'journal_id')::uuid END,
           accounting_sync_error = NULL,
           accounting_synced_at = now()
     WHERE wt.transaction_category = p_wallet_category
       AND wt.user_id = p_user
       AND (wt.reference_id = p_ref_id
            OR (p_wallet_idem IS NOT NULL AND wt.metadata->>'idempotency_key' = p_wallet_idem))
       AND wt.accounting_sync_status IS DISTINCT FROM 'SYNCED'
       AND ((wt.type = 'debit' AND v_stake_res IS NOT NULL)
            OR (wt.type <> 'debit' AND v_payout_res IS NOT NULL));
  END IF;

  RETURN jsonb_build_object(
    'product', p_product, 'reference_id', p_ref_id, 'environment', v_env,
    'stake', v_stake, 'payout', v_payout, 'house_result', v_stake - v_payout,
    'stake_journal', v_stake_res, 'payout_journal', v_payout_res);
END $$;

REVOKE ALL ON FUNCTION public.accounting_post_arcade_settlement(text,text,uuid,uuid,numeric,numeric,timestamptz,jsonb,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_post_arcade_settlement(text,text,uuid,uuid,numeric,numeric,timestamptz,jsonb,text,text) TO service_role;

-- ============ 3. Generic arcade reversal ============
CREATE OR REPLACE FUNCTION public.accounting_reverse_arcade_settlement(
  p_product text, p_ref_id uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j record; v_out jsonb := '[]'::jsonb; v_n int := 0;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may reverse arcade journals';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: reason required';
  END IF;

  FOR j IN
    SELECT id, event_type FROM public.accounting_journals
     WHERE product = p_product AND reference_id = p_ref_id::text AND status = 'POSTED'
     ORDER BY ledger_seq DESC
  LOOP
    v_out := v_out || jsonb_build_array(public.accounting_reverse_journal(
      p_journal_id := j.id,
      p_reason := p_reason,
      p_idempotency_key := p_product||'-reversal:'||p_ref_id::text||':'||coalesce(j.event_type,'leg')||':v1'));
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'ACCOUNTING_NOTHING_TO_REVERSE: no POSTED % journals for %', p_product, p_ref_id;
  END IF;
  RETURN jsonb_build_object('product', p_product, 'reference_id', p_ref_id, 'reversed', v_n, 'journals', v_out);
END $$;

REVOKE ALL ON FUNCTION public.accounting_reverse_arcade_settlement(text,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_reverse_arcade_settlement(text,uuid,text) TO service_role;

-- ============ 4. Platform P/L: exclude every *_PL_TO_RESERVE clearing account ============
CREATE OR REPLACE VIEW public.v_accounting_platform_pl
WITH (security_invoker = true) AS
SELECT a.environment,
       sum(CASE WHEN a.account_type = 'REVENUE' THEN b.balance ELSE 0 END)::numeric(18,2) AS revenue,
       sum(CASE WHEN a.account_type = 'EXPENSE' THEN b.balance ELSE 0 END)::numeric(18,2) AS expense,
       (sum(CASE WHEN a.account_type = 'REVENUE' THEN b.balance ELSE 0 END)
        - sum(CASE WHEN a.account_type = 'EXPENSE' THEN b.balance ELSE 0 END))::numeric(18,2) AS platform_pl,
       sum(CASE WHEN a.account_code = 'HOUSE_BANKROLL' THEN b.balance ELSE 0 END)::numeric(18,2) AS house_bankroll,
       (SELECT coalesce(sum(b2.balance),0)::numeric(18,2)
          FROM public.accounting_accounts a2
          JOIN public.accounting_account_balances b2 ON b2.account_id = a2.id
         WHERE a2.environment = a.environment AND a2.account_code LIKE '%\_PL\_TO\_RESERVE') AS excluded_transfer_clearing
  FROM public.accounting_accounts a
  JOIN public.accounting_account_balances b ON b.account_id = a.id
 WHERE a.status = 'ACTIVE'
   AND a.account_type IN ('REVENUE','EXPENSE','HOUSE_RESERVE','EQUITY')
   AND a.account_code NOT LIKE '%\_PL\_TO\_RESERVE'
 GROUP BY a.environment;

REVOKE ALL ON public.v_accounting_platform_pl FROM public, anon, authenticated;
GRANT SELECT ON public.v_accounting_platform_pl TO service_role;

-- ============ 5. Per-product reconciliation views ============
CREATE OR REPLACE VIEW public.v_accounting_treasure_reconciliation
WITH (security_invoker = true) AS
WITH legacy AS (
  SELECT count(*) FILTER (WHERE settled_at IS NOT NULL) AS settled_rounds,
         coalesce(sum(stake),0)::numeric(18,2) AS legacy_stakes,
         coalesce(sum(gross_return),0)::numeric(18,2) AS legacy_payouts
    FROM public.arcade_treasure_rounds
   WHERE created_at >= (SELECT min(created_at) FROM public.accounting_journals WHERE product='treasure')
), led AS (
  SELECT coalesce(sum(CASE WHEN a.account_code='TREASURE_STAKE_REVENUE' THEN ln.credit END),0)::numeric(18,2) AS ledger_stakes,
         coalesce(sum(CASE WHEN a.account_code='TREASURE_PAYOUT_EXPENSE' THEN ln.debit END),0)::numeric(18,2) AS ledger_payouts
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines ln ON ln.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = ln.account_id
   WHERE j.product='treasure' AND j.status='POSTED'
)
SELECT l.settled_rounds, l.legacy_stakes, d.ledger_stakes,
       l.legacy_payouts, d.ledger_payouts,
       (l.legacy_stakes - d.ledger_stakes) AS stake_variance,
       (l.legacy_payouts - d.ledger_payouts) AS payout_variance
  FROM legacy l CROSS JOIN led d;

CREATE OR REPLACE VIEW public.v_accounting_roulette_reconciliation
WITH (security_invoker = true) AS
WITH legacy AS (
  SELECT count(*) AS spins,
         coalesce(sum(total_stake),0)::numeric(18,2) AS legacy_stakes,
         coalesce(sum(total_return),0)::numeric(18,2) AS legacy_payouts
    FROM public.arcade_roulette_spins
   WHERE created_at >= (SELECT min(created_at) FROM public.accounting_journals WHERE product='roulette')
), led AS (
  SELECT coalesce(sum(CASE WHEN a.account_code='ROULETTE_STAKE_REVENUE' THEN ln.credit END),0)::numeric(18,2) AS ledger_stakes,
         coalesce(sum(CASE WHEN a.account_code='ROULETTE_PAYOUT_EXPENSE' THEN ln.debit END),0)::numeric(18,2) AS ledger_payouts
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines ln ON ln.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = ln.account_id
   WHERE j.product='roulette' AND j.status='POSTED'
)
SELECT l.spins, l.legacy_stakes, d.ledger_stakes,
       l.legacy_payouts, d.ledger_payouts,
       (l.legacy_stakes - d.ledger_stakes) AS stake_variance,
       (l.legacy_payouts - d.ledger_payouts) AS payout_variance
  FROM legacy l CROSS JOIN led d;

CREATE OR REPLACE VIEW public.v_accounting_blackjack_reconciliation
WITH (security_invoker = true) AS
WITH legacy AS (
  SELECT count(*) AS hands,
         coalesce(sum(total_stake),0)::numeric(18,2) AS legacy_stakes,
         coalesce(sum(total_payout),0)::numeric(18,2) AS legacy_payouts
    FROM public.arcade_bj_hands
   WHERE status = 'COMPLETED'
     AND created_at >= (SELECT min(created_at) FROM public.accounting_journals WHERE product='blackjack')
), led AS (
  SELECT coalesce(sum(CASE WHEN a.account_code='BLACKJACK_STAKE_REVENUE' THEN ln.credit END),0)::numeric(18,2) AS ledger_stakes,
         coalesce(sum(CASE WHEN a.account_code='BLACKJACK_PAYOUT_EXPENSE' THEN ln.debit END),0)::numeric(18,2) AS ledger_payouts
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines ln ON ln.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = ln.account_id
   WHERE j.product='blackjack' AND j.status='POSTED'
)
SELECT l.hands, l.legacy_stakes, d.ledger_stakes,
       l.legacy_payouts, d.ledger_payouts,
       (l.legacy_stakes - d.ledger_stakes) AS stake_variance,
       (l.legacy_payouts - d.ledger_payouts) AS payout_variance
  FROM legacy l CROSS JOIN led d;

REVOKE ALL ON public.v_accounting_treasure_reconciliation, public.v_accounting_roulette_reconciliation, public.v_accounting_blackjack_reconciliation FROM public, anon, authenticated;
GRANT SELECT ON public.v_accounting_treasure_reconciliation, public.v_accounting_roulette_reconciliation, public.v_accounting_blackjack_reconciliation TO service_role;
