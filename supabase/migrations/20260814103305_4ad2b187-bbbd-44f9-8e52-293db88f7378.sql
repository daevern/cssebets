INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, product, environment, currency_or_unit, status)
SELECT code, atype::public.acct_account_type, nbal::public.acct_normal_balance, prod, env, 'POINTS', 'ACTIVE'
FROM (
  VALUES
    ('KENO_STAKE_REVENUE','REVENUE','CREDIT','keno'),
    ('KENO_PAYOUT_EXPENSE','EXPENSE','DEBIT','keno'),
    ('KENO_PL_TO_RESERVE','EQUITY','DEBIT','keno'),
    ('CRASH_STAKE_REVENUE','REVENUE','CREDIT','crash'),
    ('CRASH_PAYOUT_EXPENSE','EXPENSE','DEBIT','crash'),
    ('CRASH_PL_TO_RESERVE','EQUITY','DEBIT','crash')
) AS v(code, atype, nbal, prod)
CROSS JOIN (VALUES ('PRODUCTION'::public.acct_environment), ('SIMULATION'::public.acct_environment)) AS e(env)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = v.code AND a.environment = e.env AND a.user_id IS NULL
);

INSERT INTO public.accounting_migration_flags (product, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
VALUES
  ('keno', true, true, true, true, 'CSSE Originals Keno'),
  ('crash', true, true, true, true, 'CSSE Originals Crash')
ON CONFLICT (product) DO UPDATE
  SET journal_enabled = true, dual_write = true,
      liability_enforced = true, capacity_enforced = true, updated_at = now();

CREATE OR REPLACE FUNCTION public.accounting_post_arcade_settlement(p_product text, p_ref_type text, p_ref_id uuid, p_user uuid, p_stake numeric, p_payout numeric, p_effective timestamp with time zone, p_meta jsonb DEFAULT '{}'::jsonb, p_wallet_category text DEFAULT NULL::text, p_wallet_idem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_env public.acct_environment;
  v_wallet uuid;
  v_stake_acct uuid;
  v_payout_acct uuid;
  v_reserve_acct uuid;
  v_bankroll_acct uuid;
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_stake_res jsonb := NULL;
  v_payout_res jsonb := NULL;
  v_prefix text := upper(p_product);
  v_base_idem text := coalesce(nullif(trim(p_wallet_idem), ''), p_ref_id::text);
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post arcade journals';
  END IF;
  IF p_product NOT IN ('treasure','roulette','blackjack','rps','hilo','dice','wheel','keno','crash') THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: unsupported product %', p_product;
  END IF;

  SELECT a.id, a.environment
    INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = p_user
     AND a.account_code = 'USER_WALLET'
     AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', p_user;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_STAKE_REVENUE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_PAYOUT_EXPENSE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_reserve_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_PL_TO_RESERVE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';

  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_reserve_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: missing % accounts for environment %', v_prefix, v_env;
  END IF;

  v_stake := public.acct_round_stake(coalesce(p_stake, 0));
  v_payout := public.acct_round_payout(coalesce(p_payout, 0));

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      p_journal_type => 'STAKE_PLACED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_wallet, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct, 'debit', 0, 'credit', v_stake),
        jsonb_build_object('account_id', v_stake_acct, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0, 'credit', v_stake)
      ),
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'STAKE_PLACED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'wallet_category', p_wallet_category, 'wallet_idem', v_base_idem),
      p_environment => v_env::text
    );
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      p_journal_type => 'PAYOUT_SETTLED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet, 'debit', 0, 'credit', v_payout),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_payout_acct, 'debit', 0, 'credit', v_payout)
      ),
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'PAYOUT_SETTLED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'wallet_category', p_wallet_category, 'wallet_idem', p_wallet_idem),
      p_environment => v_env::text
    );
  END IF;

  RETURN jsonb_build_object('stake', v_stake_res, 'payout', v_payout_res);
END $function$;