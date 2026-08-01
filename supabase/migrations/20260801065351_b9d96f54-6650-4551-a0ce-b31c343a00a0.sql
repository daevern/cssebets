CREATE OR REPLACE FUNCTION public.accounting_pl_report(p_environment acct_environment DEFAULT 'PRODUCTION'::acct_environment, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_basis text DEFAULT 'settlement'::text, p_products text[] DEFAULT NULL::text[], p_game text DEFAULT NULL::text, p_sport text DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid, p_config_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := coalesce(p_to,   'infinity'::timestamptz);
  v_asof timestamptz := coalesce(p_to, now());
  v_live boolean := (p_to IS NULL);
  v_basis text := lower(coalesce(p_basis, 'settlement'));
  v_open numeric := 0; v_close numeric := 0;
  v_payable numeric := 0; v_reserved_enforced numeric := 0;
  v_available numeric := 0; v_auth_available numeric := NULL;
  v_products jsonb := '[]'::jsonb;
  v_platform jsonb; v_pending jsonb; v_recon jsonb;
  v_adjust numeric := 0;
  v_stakes numeric := 0; v_void_stakes numeric := 0; v_payouts numeric := 0;
  v_refunds numeric := 0; v_pl numeric := 0;
  v_phys numeric := 0; v_attr_out numeric := 0; v_posted_unattr numeric := 0;
  v_house_attr numeric := 0; v_out_scope numeric := 0; v_bridged numeric := 0;
  v_payout_expense_total numeric := 0;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_basis NOT IN ('settlement','placement') THEN
    RAISE EXCEPTION 'INVALID_BASIS';
  END IF;

  WITH j AS (
    SELECT x.id, x.product, x.game, x.journal_type::text AS journal_type,
           x.reference_type, x.reference_id, x.effective_at
      FROM public.accounting_journals x
     WHERE x.status = 'POSTED'
       AND x.environment = p_environment
       AND (p_products IS NULL OR x.product = ANY (p_products))
       AND (p_game IS NULL OR x.game = p_game)
       AND (p_config_version IS NULL
            OR coalesce(x.metadata->>'config_version', x.metadata->>'rule_version') = p_config_version)
       AND (p_user IS NULL OR EXISTS (
             SELECT 1 FROM public.accounting_journal_lines l
               JOIN public.accounting_accounts a ON a.id = l.account_id
              WHERE l.journal_id = x.id AND a.account_code = 'USER_WALLET' AND a.user_id = p_user))
  ),
  settle AS (
    SELECT reference_type, reference_id,
           min(effective_at) AS settled_at,
           bool_or(journal_type = 'PAYOUT_SETTLED') AS has_payout,
           bool_or(journal_type IN ('REFUND','VOID')) AS has_void
      FROM j WHERE journal_type IN ('PAYOUT_SETTLED','REFUND','VOID') AND reference_id IS NOT NULL
     GROUP BY 1,2
  ),
  rel AS (
    SELECT r.reference_type, r.reference_id::text AS reference_id,
           min(coalesce(r.released_at, r.superseded_at)) AS released_at
      FROM public.accounting_liability_reservations r
     WHERE r.environment = p_environment
       AND coalesce(r.released_at, r.superseded_at) IS NOT NULL
       AND (p_products IS NULL OR r.product = ANY (p_products))
       AND (p_game IS NULL OR r.game = p_game)
       AND (p_user IS NULL OR r.user_id = p_user)
     GROUP BY 1,2
  ),
  place AS (
    SELECT reference_type, reference_id, min(effective_at) AS placed_at
      FROM j WHERE journal_type = 'STAKE_PLACED' AND reference_id IS NOT NULL
     GROUP BY 1,2
  ),
  scope AS (
    SELECT j.id AS journal_id, j.product, j.journal_type, j.effective_at,
           coalesce(s.has_void, false) AND NOT coalesce(s.has_payout, false) AS void_position,
           CASE
             WHEN v_basis = 'placement' THEN coalesce(p.placed_at, j.effective_at)
             ELSE CASE WHEN j.journal_type = 'STAKE_PLACED'
                         THEN coalesce(s.settled_at, rl.released_at)
                       ELSE coalesce(s.settled_at, j.effective_at) END
           END AS attributed_at,
           (j.journal_type = 'STAKE_PLACED'
              AND s.settled_at IS NULL AND rl.released_at IS NOT NULL) AS zero_payout_settled
      FROM j
      LEFT JOIN settle s ON s.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND s.reference_id   IS NOT DISTINCT FROM j.reference_id
      LEFT JOIN rel    rl ON rl.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND rl.reference_id   IS NOT DISTINCT FROM j.reference_id
      LEFT JOIN place  p ON p.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND p.reference_id   IS NOT DISTINCT FROM j.reference_id
  ),
  in_range AS (
    SELECT * FROM scope
     WHERE attributed_at IS NOT NULL AND attributed_at >= v_from AND attributed_at <= v_to
  ),
  agg AS (
    SELECT s.product,
           round(coalesce(sum(l.credit) FILTER (WHERE a.account_code LIKE '%\_STAKE\_REVENUE'),0),2) AS stakes,
           round(coalesce(sum(l.credit) FILTER (WHERE a.account_code LIKE '%\_STAKE\_REVENUE'
                                                  AND s.void_position),0),2) AS refunded_stakes,
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'
                                                  AND s.journal_type = 'PAYOUT_SETTLED'),0),2) AS gross_payouts,
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'
                                                  AND s.journal_type IN ('REFUND','VOID')),0),2) AS refunds,
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'),0),2) AS payout_expense_total,
           round(coalesce(sum(l.debit - l.credit) FILTER (WHERE a.account_code LIKE '%\_PL\_TO\_RESERVE'),0),2) AS realised_pl,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type = 'PAYOUT_SETTLED'
                                                  OR s.zero_payout_settled) AS settled_positions
      FROM in_range s
      JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE s.product IS NOT NULL
     GROUP BY s.product
  ),
  resv AS (
    SELECT r.*
      FROM public.accounting_liability_reservations r
     WHERE r.environment = p_environment
       AND coalesce(r.reserved_at, r.created_at) <= v_asof
       AND (LEAST(r.released_at, r.superseded_at) IS NULL
            OR LEAST(r.released_at, r.superseded_at) > v_asof)
       AND (p_products IS NULL OR r.product = ANY (p_products))
       AND (p_game IS NULL OR r.game = p_game)
       AND (p_user IS NULL OR r.user_id = p_user)
       AND (p_config_version IS NULL OR r.config_version = p_config_version)
  ),
  pend AS (
    SELECT r.product,
           round(coalesce(sum(r.stake_collected),0),2)   AS open_stakes,
           round(coalesce(sum(r.reserved_amount),0),2)   AS reserved_liability,
           round(coalesce(sum(r.max_gross_payout),0),2)  AS max_potential_payout,
           count(*)                                      AS pending_positions
      FROM resv r GROUP BY r.product
  ),
  prods AS (
    SELECT product FROM public.accounting_migration_flags
    UNION SELECT product FROM agg WHERE product IS NOT NULL
    UNION SELECT product FROM pend WHERE product IS NOT NULL
    UNION SELECT product FROM public.accounting_journals
           WHERE environment = p_environment AND status = 'POSTED' AND product IS NOT NULL
  ),
  rows AS (
    SELECT pr.product,
           CASE WHEN pr.product IN ('football','ufc','f1','sports_generic','basketball')
                THEN 'sports' ELSE 'arcade' END AS grp,
           coalesce(f.journal_enabled, false) AS journal_backed,
           CASE
             WHEN coalesce(f.journal_enabled, false) THEN 'journal-enabled'
             WHEN coalesce(f.dual_write, false)      THEN 'shadow'
             WHEN f.product IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.accounting_journals hj
                     WHERE hj.product = pr.product AND hj.status = 'POSTED'
                       AND hj.environment = p_environment) THEN 'disabled'
             ELSE 'legacy'
           END AS coverage_status,
           coalesce(agg.stakes,0)                AS stakes,
           coalesce(agg.refunded_stakes,0)       AS refunded_stakes,
           round(coalesce(agg.stakes,0) - coalesce(agg.refunded_stakes,0),2) AS net_settled_stakes,
           coalesce(agg.gross_payouts,0)         AS gross_payouts,
           coalesce(agg.refunds,0)               AS refunds,
           coalesce(agg.payout_expense_total,0)  AS payout_expense_total,
           coalesce(agg.realised_pl,0)           AS realised_pl,
           coalesce(agg.settled_positions,0)     AS settled_positions,
           CASE WHEN coalesce(agg.stakes,0) - coalesce(agg.refunded_stakes,0) > 0
                THEN round(100 * coalesce(agg.realised_pl,0)
                     / (agg.stakes - agg.refunded_stakes), 2) END AS hold_pct,
           CASE WHEN coalesce(agg.stakes,0) > 0
                THEN round(100 * coalesce(agg.realised_pl,0) / agg.stakes, 2) END AS gross_hold_pct,
           coalesce(pend.open_stakes,0)          AS open_stakes,
           coalesce(pend.reserved_liability,0)   AS reserved_liability,
           coalesce(pend.max_potential_payout,0) AS max_potential_payout,
           coalesce(pend.pending_positions,0)    AS pending_positions
      FROM prods pr
      LEFT JOIN public.accounting_migration_flags f ON f.product = pr.product
      LEFT JOIN agg  ON agg.product  = pr.product
      LEFT JOIN pend ON pend.product = pr.product
     WHERE (p_products IS NULL OR pr.product = ANY (p_products))
  )
  SELECT
    coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.grp, r.product) FROM rows r
               WHERE p_sport IS NULL OR r.grp = p_sport), '[]'::jsonb),
    coalesce((SELECT round(sum(l.debit - l.credit),2)
                FROM in_range s
                JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code IN ('ADMIN_ADJUSTMENT','MIGRATION_ADJUSTMENT','ROUNDING_ADJUSTMENT',
                                        'BONUS_EXPENSE','POINTS_EXPIRY')), 0),
    coalesce((SELECT round(sum(l.credit - l.debit),2)
                FROM in_range s
                JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment), 0),
    coalesce((SELECT round(sum(l.credit - l.debit),2)
                FROM in_range s
                JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
                 AND (s.effective_at < v_from OR s.effective_at > v_to)), 0),
    coalesce((SELECT round(sum(l.credit - l.debit),2)
                FROM scope s
                JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
                 AND s.effective_at >= v_from AND s.effective_at <= v_to
                 AND (s.attributed_at IS NULL OR s.attributed_at < v_from OR s.attributed_at > v_to)), 0),
    coalesce((SELECT round(sum(l.credit - l.debit),2)
                FROM public.accounting_journals hj
                JOIN public.accounting_journal_lines l ON l.journal_id = hj.id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
                 AND hj.environment = p_environment
                 AND hj.status IN ('POSTED','REVERSED')
                 AND hj.effective_at >= v_from AND hj.effective_at <= v_to
                 AND NOT EXISTS (SELECT 1 FROM j WHERE j.id = hj.id)), 0)
    INTO v_products, v_adjust, v_house_attr, v_attr_out, v_posted_unattr, v_out_scope;

  SELECT coalesce(sum((x->>'stakes')::numeric),0),
         coalesce(sum((x->>'refunded_stakes')::numeric),0),
         coalesce(sum((x->>'gross_payouts')::numeric),0),
         coalesce(sum((x->>'refunds')::numeric),0),
         coalesce(sum((x->>'payout_expense_total')::numeric),0),
         coalesce(sum((x->>'realised_pl')::numeric),0)
    INTO v_stakes, v_void_stakes, v_payouts, v_refunds, v_payout_expense_total, v_pl
    FROM jsonb_array_elements(v_products) x;

  SELECT coalesce((
    SELECT l.balance_after FROM public.accounting_journal_lines l
      JOIN public.accounting_journals j ON j.id = l.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
       AND j.status IN ('POSTED','REVERSED') AND j.effective_at < v_from
     ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1), 0) INTO v_open;

  SELECT coalesce((
    SELECT l.balance_after FROM public.accounting_journal_lines l
      JOIN public.accounting_journals j ON j.id = l.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
       AND j.status IN ('POSTED','REVERSED') AND j.effective_at <= v_to
     ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1), v_open) INTO v_close;

  SELECT coalesce((
    SELECT l.balance_after FROM public.accounting_journal_lines l
      JOIN public.accounting_journals j ON j.id = l.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.account_code = 'PAYOUTS_PAYABLE' AND a.environment = p_environment
       AND j.status IN ('POSTED','REVERSED') AND j.effective_at <= v_to
     ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1), 0) INTO v_payable;

  SELECT round(coalesce(sum(r.reserved_amount),0),2) INTO v_reserved_enforced
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_environment AND r.counts_toward_available
     AND coalesce(r.reserved_at, r.created_at) <= v_asof
     AND (LEAST(r.released_at, r.superseded_at) IS NULL
          OR LEAST(r.released_at, r.superseded_at) > v_asof);

  v_available := round(v_close - v_payable - v_reserved_enforced, 2);
  IF v_live THEN
    v_auth_available := public.accounting_available_reserve(p_environment);
  END IF;

  SELECT round(coalesce(sum(l.credit - l.debit),0),2) INTO v_phys
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines l ON l.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.status IN ('POSTED','REVERSED') AND j.environment = p_environment
     AND a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
     AND j.effective_at >= v_from AND j.effective_at <= v_to;

  v_bridged := round(v_house_attr - v_attr_out + v_posted_unattr + v_out_scope, 2);

  SELECT jsonb_build_object(
      'open_stakes',          coalesce(sum((x->>'open_stakes')::numeric),0),
      'reserved_liability',   coalesce(sum((x->>'reserved_liability')::numeric),0),
      'max_potential_payout', coalesce(sum((x->>'max_potential_payout')::numeric),0),
      'pending_positions',    coalesce(sum((x->>'pending_positions')::numeric),0),
      'as_of',                v_asof)
    INTO v_pending FROM jsonb_array_elements(v_products) x;

  v_recon := jsonb_build_object(
    'as_of', v_asof,
    'bankroll_by_posting_date', jsonb_build_object(
       'opening_bankroll',           round(v_open,2),
       'physical_bankroll_movement', v_phys,
       'closing_bankroll',           round(v_close,2),
       'identity_ok',                round(v_open + v_phys,2) = round(v_close,2)),
    'timing_bridge', jsonb_build_object(
       'realised_pl_by_attribution',          round(v_pl + v_adjust,2),
       'attributed_house_movement',           v_house_attr,
       'opening_position_timing_adjustment',  v_attr_out,
       'closing_position_timing_adjustment',  v_posted_unattr,
       'out_of_scope_house_movement',         v_out_scope,
       'bridged_bankroll_movement',           v_bridged,
       'bridge_ok',                           v_bridged = v_phys,
       'pl_equals_attributed_house_movement', round(v_pl + v_adjust,2) = v_house_attr),
    'note', 'Realised P/L is attributed by ' || v_basis ||
            ' date; physical bankroll movement is by journal posting date. They differ by the '
            'timing and out-of-scope adjustments above; both figures are valid measures.');

  v_platform := jsonb_build_object(
    'opening_bankroll',            round(v_open,2),
    'closing_bankroll',            round(v_close,2),
    'physical_bankroll_movement',  v_phys,
    'payouts_payable_outstanding', round(v_payable,2),
    'active_reserved_liability',   round(v_reserved_enforced,2),
    'available_bankroll',          v_available,
    'available_bankroll_basis',    CASE WHEN v_live THEN 'live' ELSE 'as_of' END,
    'available_bankroll_authoritative', v_auth_available,
    'gross_stakes',                round(v_stakes,2),
    'refunded_stakes',             round(v_void_stakes,2),
    'net_settled_stakes',          round(v_stakes - v_void_stakes,2),
    'total_stakes',                round(v_stakes,2),
    'gross_payouts',               round(v_payouts,2),
    'refunds',                     round(v_refunds,2),
    'adjustments',                 round(v_adjust,2),
    'product_pl',                  round(v_pl,2),
    'realised_pl',                 round(v_pl + v_adjust,2),
    'open_liability',              round(v_reserved_enforced,2),
    'hold_pct',       CASE WHEN v_stakes - v_void_stakes > 0
                           THEN round(100 * v_pl / (v_stakes - v_void_stakes), 2) END,
    'gross_hold_pct', CASE WHEN v_stakes > 0 THEN round(100 * v_pl / v_stakes, 2) END,
    'pending',                     v_pending);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'params', jsonb_build_object(
       'environment', p_environment, 'from', p_from, 'to', p_to, 'basis', v_basis,
       'products', p_products, 'game', p_game, 'sport', p_sport,
       'user_id', p_user, 'config_version', p_config_version),
    'platform', v_platform,
    'reconciliation', v_recon,
    'groups', (
      SELECT coalesce(jsonb_agg(q.g ORDER BY q.grp), '[]'::jsonb) FROM (
        SELECT grp, jsonb_build_object(
          'group', grp,
          'totals', jsonb_build_object(
            'stakes',               round(sum(stakes),2),
            'refunded_stakes',      round(sum(refunded_stakes),2),
            'net_settled_stakes',   round(sum(net_settled_stakes),2),
            'gross_payouts',        round(sum(gross_payouts),2),
            'refunds',              round(sum(refunds),2),
            'realised_pl',          round(sum(realised_pl),2),
            'settled_positions',    sum(settled_positions),
            'open_stakes',          round(sum(open_stakes),2),
            'reserved_liability',   round(sum(reserved_liability),2),
            'max_potential_payout', round(sum(max_potential_payout),2),
            'pending_positions',    sum(pending_positions),
            'hold_pct', CASE WHEN sum(net_settled_stakes) > 0
                             THEN round(100 * sum(realised_pl) / sum(net_settled_stakes), 2) END,
            'gross_hold_pct', CASE WHEN sum(stakes) > 0
                             THEN round(100 * sum(realised_pl) / sum(stakes), 2) END),
          'products', jsonb_agg(row ORDER BY row->>'product')) AS g
          FROM (
            SELECT x AS row, x->>'grp' AS grp,
                   (x->>'stakes')::numeric stakes,
                   (x->>'refunded_stakes')::numeric refunded_stakes,
                   (x->>'net_settled_stakes')::numeric net_settled_stakes,
                   (x->>'gross_payouts')::numeric gross_payouts,
                   (x->>'refunds')::numeric refunds,
                   (x->>'realised_pl')::numeric realised_pl,
                   (x->>'settled_positions')::numeric settled_positions,
                   (x->>'open_stakes')::numeric open_stakes,
                   (x->>'reserved_liability')::numeric reserved_liability,
                   (x->>'max_potential_payout')::numeric max_potential_payout,
                   (x->>'pending_positions')::numeric pending_positions
              FROM jsonb_array_elements(v_products) x) s
         GROUP BY grp) q),
    'checks', jsonb_build_object(
      'platform_pl_equals_products_plus_adjustments',
        round(v_pl + v_adjust, 2) = round((v_platform->>'realised_pl')::numeric, 2),
      'available_bankroll_matches_authoritative',
        CASE WHEN v_live THEN round(v_available,2) = round(coalesce(v_auth_available,0),2) END,
      'bankroll_identity_ok', round(v_open + v_phys,2) = round(v_close,2),
      'timing_bridge_ok', v_bridged = v_phys,
      'refunds_not_double_counted',
        round(v_payouts + v_refunds,2) = round(v_payout_expense_total,2),
      'products_not_yet_journal_backed', (
        SELECT coalesce(jsonb_agg(product ORDER BY product), '[]'::jsonb)
          FROM public.accounting_migration_flags WHERE NOT journal_enabled))
  );
END $function$;

CREATE OR REPLACE FUNCTION public.accounting_bankroll_reconciliation(p_environment acct_environment DEFAULT 'PRODUCTION'::acct_environment)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journal numeric := 0;
  v_payable numeric := 0;
  v_reserved numeric := 0;
  v_legacy numeric := 0;
  v_legacy_at timestamptz;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT round(coalesce(b.balance,0),2) INTO v_journal
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment;

  SELECT round(coalesce(b.balance,0),2) INTO v_payable
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'PAYOUTS_PAYABLE' AND a.environment = p_environment;

  SELECT round(coalesce(sum(r.reserved_amount),0),2) INTO v_reserved
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_environment AND r.status = 'ACTIVE' AND r.counts_toward_available;

  SELECT round(coalesce(balance,0),2), updated_at INTO v_legacy, v_legacy_at
    FROM public.platform_bankroll WHERE id = 1;

  RETURN jsonb_build_object(
    'environment', p_environment,
    'generated_at', now(),
    'authoritative', jsonb_build_object(
      'source', 'accounting_account_balances.HOUSE_BANKROLL',
      'house_bankroll', coalesce(v_journal,0),
      'payouts_payable', coalesce(v_payable,0),
      'active_reserved_liability', coalesce(v_reserved,0),
      'available_reserve', public.accounting_available_reserve(p_environment)),
    'legacy', jsonb_build_object(
      'source', 'platform_bankroll (id=1, sports-only writer)',
      'balance', coalesce(v_legacy,0),
      'updated_at', v_legacy_at),
    'delta_journal_minus_legacy',
      CASE WHEN p_environment = 'PRODUCTION'
           THEN round(coalesce(v_journal,0) - coalesce(v_legacy,0), 2) END,
    'note', 'platform_bankroll is only written by legacy sports settlement; arcade activity '
            'is journal-only. Use the authoritative block for all bankroll and capacity reads.');
END $function$;

GRANT EXECUTE ON FUNCTION public.accounting_bankroll_reconciliation(acct_environment) TO service_role;