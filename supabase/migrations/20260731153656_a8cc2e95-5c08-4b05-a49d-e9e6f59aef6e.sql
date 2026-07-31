-- ============ Phase 8: Global monetary rounding policy ============

CREATE OR REPLACE FUNCTION public.acct_money_scale()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;

CREATE OR REPLACE FUNCTION public.acct_round_money(v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT round(COALESCE(v,0)::numeric, 2) $$;

CREATE OR REPLACE FUNCTION public.acct_round_stake(v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT round(COALESCE(v,0)::numeric, 2) $$;

CREATE OR REPLACE FUNCTION public.acct_round_payout(v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT round(COALESCE(v,0)::numeric, 2) $$;

-- Liability/exposure always rounds UP so the house never under-reserves
CREATE OR REPLACE FUNCTION public.acct_round_liability(v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT ceil(COALESCE(v,0)::numeric * 100) / 100 $$;

CREATE OR REPLACE FUNCTION public.acct_money_ok(v numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT v IS NULL OR scale(v) <= 2 $$;

COMMENT ON FUNCTION public.acct_round_money(numeric) IS
  'Phase 8 global monetary rounding policy: all points amounts are numeric(_,2), rounded half-up.';

-- Drop dependent views so money columns can be tightened, recreate after
DROP VIEW IF EXISTS public.match_market_exposure;
DROP VIEW IF EXISTS public.v_accounting_migration_readiness;

ALTER TABLE public.predictions
  ALTER COLUMN gross_payout TYPE numeric(18,2),
  ALTER COLUMN house_profit_loss TYPE numeric(18,2),
  ALTER COLUMN net_profit TYPE numeric(18,2);

ALTER TABLE public.payout_requests
  ALTER COLUMN amount TYPE numeric(18,2);

ALTER TABLE public.wallet_adjustment_requests
  ALTER COLUMN amount TYPE numeric(18,2),
  ALTER COLUMN before_balance TYPE numeric(18,2),
  ALTER COLUMN after_balance TYPE numeric(18,2);

ALTER TABLE public.matches
  ALTER COLUMN worst_case_gross_payout TYPE numeric(18,2),
  ALTER COLUMN worst_case_net_liability TYPE numeric(18,2);

ALTER TABLE public.correlated_exposure_alerts
  ALTER COLUMN gross_payout TYPE numeric(18,2),
  ALTER COLUMN net_liability TYPE numeric(18,2),
  ALTER COLUMN total_stake TYPE numeric(18,2);

ALTER TABLE public.match_exposure_scenarios
  ALTER COLUMN gross_payout TYPE numeric(18,2),
  ALTER COLUMN net_liability TYPE numeric(18,2),
  ALTER COLUMN total_stake_involved TYPE numeric(18,2);

CREATE VIEW public.match_market_exposure AS
 SELECT match_id,
    COALESCE(market_text, (market)::text) AS market,
    COALESCE(selection_label, outcome) AS selection,
    (count(*))::integer AS bet_count,
    sum(virtual_stake) AS total_stake,
    sum(potential_return) AS liability
   FROM predictions p
  WHERE (status = 'pending'::prediction_status)
  GROUP BY match_id, COALESCE(market_text, (market)::text), COALESCE(selection_label, outcome);

CREATE VIEW public.v_accounting_migration_readiness AS
 WITH drift AS (
         SELECT count(*) FILTER (WHERE (v_accounting_wallet_drift.drift <> (0)::numeric)) AS drift_users,
            COALESCE(sum(abs(v_accounting_wallet_drift.drift)), (0)::numeric) AS drift_total
           FROM v_accounting_wallet_drift
        ), bridge AS (
         SELECT count(*) FILTER (WHERE (wallet_transactions.accounting_sync_status = 'PENDING'::text)) AS pending_tx,
            count(*) FILTER (WHERE (wallet_transactions.accounting_sync_status = 'ERROR'::text)) AS error_tx
           FROM wallet_transactions
        ), tb AS (
         SELECT (COALESCE(sum(v_accounting_trial_balance.debit_total), (0)::numeric) - COALESCE(sum(v_accounting_trial_balance.credit_total), (0)::numeric)) AS imbalance
           FROM v_accounting_trial_balance
        ), mixed AS (
         SELECT count(*) AS mixed_journals
           FROM (( SELECT l.journal_id
                   FROM (accounting_journal_lines l
                     JOIN accounting_accounts a ON ((a.id = l.account_id)))
                  GROUP BY l.journal_id
                 HAVING (count(DISTINCT a.environment) > 1)) m
             JOIN accounting_journals j ON ((j.id = m.journal_id)))
          WHERE ((j.status <> 'REVERSED'::acct_journal_status) AND (COALESCE(((j.metadata ->> 'mixed_environment_reversal'::text))::boolean, false) = false))
        ), payable AS (
         SELECT COALESCE(sum(pr.amount), (0)::numeric) AS reserved_total,
            COALESCE(sum(pr.amount) FILTER (WHERE (ri.id IS NULL)), (0)::numeric) AS unclassified_total
           FROM (payout_requests pr
             LEFT JOIN accounting_reconciliation_items ri ON (((ri.scope = 'reserved_payout_liability'::text) AND ((ri.evidence ->> 'payout_request_id'::text) = (pr.id)::text))))
          WHERE (pr.status = 'proof_uploaded'::payout_request_status)
        )
 SELECT drift.drift_users,
    drift.drift_total,
    bridge.pending_tx,
    bridge.error_tx,
    tb.imbalance AS trial_balance_imbalance,
    mixed.mixed_journals,
    payable.reserved_total AS reserved_payout_liability,
    payable.unclassified_total AS unclassified_reserved_liability,
    ((drift.drift_users = 0) AND (bridge.pending_tx = 0) AND (bridge.error_tx = 0) AND (tb.imbalance = (0)::numeric) AND (mixed.mixed_journals = 0) AND (payable.unclassified_total = (0)::numeric)) AS ready_for_product_migration,
    now() AS checked_at
   FROM drift, bridge, tb, mixed, payable;

CREATE OR REPLACE FUNCTION public.accounting_phase8_selftest()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  n bigint;
  v numeric;
BEGIN
  check_name := 'round_half_up';
  passed := acct_round_money(1.005) = 1.01 AND acct_round_money(-1.005) = -1.01;
  detail := format('1.005 -> %s', acct_round_money(1.005));
  RETURN NEXT;

  check_name := 'liability_rounds_up';
  passed := acct_round_liability(1.001) = 1.01;
  detail := format('1.001 -> %s', acct_round_liability(1.001));
  RETURN NEXT;

  SELECT count(*) INTO n FROM wallet_transactions
   WHERE NOT (acct_money_ok(amount) AND acct_money_ok(balance_before) AND acct_money_ok(balance_after));
  check_name := 'wallet_transactions_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM wallets WHERE NOT acct_money_ok(balance);
  check_name := 'wallets_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM accounting_journal_lines
   WHERE NOT (acct_money_ok(debit) AND acct_money_ok(credit) AND acct_money_ok(signed_effect));
  check_name := 'journal_lines_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM predictions
   WHERE NOT (acct_money_ok(virtual_stake) AND acct_money_ok(potential_return)
              AND acct_money_ok(gross_payout) AND acct_money_ok(net_profit)
              AND acct_money_ok(house_profit_loss));
  check_name := 'predictions_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM ufc_bets
   WHERE NOT (acct_money_ok(stake) AND acct_money_ok(potential_payout) AND acct_money_ok(payout));
  check_name := 'ufc_bets_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM f1_bets
   WHERE NOT (acct_money_ok(stake) AND acct_money_ok(potential_payout));
  check_name := 'f1_bets_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM accounting_liability_reservations
   WHERE NOT (acct_money_ok(reserved_amount) AND acct_money_ok(max_gross_payout)
              AND acct_money_ok(max_net_liability) AND acct_money_ok(stake_collected));
  check_name := 'reservations_scale'; passed := n = 0; detail := format('%s violations', n); RETURN NEXT;

  SELECT count(*) INTO n FROM wallet_transactions wt
   WHERE wt.balance_before IS NOT NULL AND wt.balance_after IS NOT NULL
     AND abs(wt.balance_after - wt.balance_before) <> abs(wt.amount);
  check_name := 'wallet_txn_arithmetic'; passed := n = 0; detail := format('%s rows where delta <> amount', n); RETURN NEXT;

  SELECT count(*) INTO n FROM (
    SELECT journal_id FROM accounting_journal_lines
    GROUP BY journal_id HAVING round(sum(debit),2) <> round(sum(credit),2)
  ) x;
  check_name := 'journals_balanced'; passed := n = 0; detail := format('%s unbalanced journals', n); RETURN NEXT;

  SELECT count(*) INTO n FROM ufc_bets
   WHERE potential_payout IS NOT NULL AND odds_locked IS NOT NULL
     AND abs(potential_payout - acct_round_payout(stake * odds_locked)) > 0.01;
  check_name := 'ufc_potential_payout_rounding'; passed := n = 0; detail := format('%s drifted rows', n); RETURN NEXT;

  SELECT count(*) INTO n FROM f1_bets
   WHERE potential_payout IS NOT NULL AND odds_locked IS NOT NULL
     AND abs(potential_payout - acct_round_payout(stake * odds_locked)) > 0.01;
  check_name := 'f1_potential_payout_rounding'; passed := n = 0; detail := format('%s drifted rows', n); RETURN NEXT;

  SELECT COALESCE(sum(abs(round(l.debit,2) - l.debit) + abs(round(l.credit,2) - l.credit)),0)
    INTO v FROM accounting_journal_lines l;
  check_name := 'zero_unposted_residual'; passed := COALESCE(v,0) = 0; detail := format('residual %s', COALESCE(v,0)); RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.accounting_phase8_selftest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_phase8_selftest() TO service_role;