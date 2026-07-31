CREATE OR REPLACE FUNCTION public.accounting_pl_report(
  p_environment public.acct_environment DEFAULT 'PRODUCTION',
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_basis text DEFAULT 'settlement',
  p_products text[] DEFAULT NULL,
  p_game text DEFAULT NULL,
  p_sport text DEFAULT NULL,
  p_user uuid DEFAULT NULL,
  p_config_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := coalesce(p_to,   'infinity'::timestamptz);
  v_basis text := lower(coalesce(p_basis, 'settlement'));
  v_open numeric := 0; v_close numeric := 0;
  v_products jsonb := '[]'::jsonb;
  v_platform jsonb; v_pending jsonb;
  v_adjust numeric := 0; v_open_liability numeric := 0;
  v_stakes numeric := 0; v_payouts numeric := 0;
  v_refunds numeric := 0; v_pl numeric := 0;
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
    SELECT reference_type, reference_id, min(effective_at) AS settled_at
      FROM j WHERE journal_type IN ('PAYOUT_SETTLED','REFUND','VOID') AND reference_id IS NOT NULL
     GROUP BY 1,2
  ),
  place AS (
    SELECT reference_type, reference_id, min(effective_at) AS placed_at
      FROM j WHERE journal_type = 'STAKE_PLACED' AND reference_id IS NOT NULL
     GROUP BY 1,2
  ),
  scope AS (
    SELECT j.id AS journal_id, j.product, j.journal_type,
           CASE
             WHEN v_basis = 'placement' THEN coalesce(p.placed_at, j.effective_at)
             ELSE CASE WHEN j.journal_type = 'STAKE_PLACED' THEN s.settled_at
                       ELSE coalesce(s.settled_at, j.effective_at) END
           END AS attributed_at
      FROM j
      LEFT JOIN settle s ON s.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND s.reference_id   IS NOT DISTINCT FROM j.reference_id
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
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'
                                                  AND s.journal_type = 'PAYOUT_SETTLED'),0),2) AS gross_payouts,
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'
                                                  AND s.journal_type IN ('REFUND','VOID')),0),2) AS refunds,
           round(coalesce(sum(l.debit - l.credit) FILTER (WHERE a.account_code LIKE '%\_PL\_TO\_RESERVE'),0),2) AS realised_pl,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type = 'PAYOUT_SETTLED') AS settled_positions
      FROM in_range s
      JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE s.product IS NOT NULL
     GROUP BY s.product
  ),
  pend AS (
    SELECT r.product,
           round(coalesce(sum(r.stake_collected),0),2)   AS open_stakes,
           round(coalesce(sum(r.reserved_amount),0),2)   AS reserved_liability,
           round(coalesce(sum(r.max_gross_payout),0),2)  AS max_potential_payout,
           count(*)                                      AS pending_positions
      FROM public.accounting_liability_reservations r
     WHERE r.status = 'ACTIVE' AND r.environment = p_environment
       AND (p_products IS NULL OR r.product = ANY (p_products))
       AND (p_game IS NULL OR r.game = p_game)
       AND (p_user IS NULL OR r.user_id = p_user)
       AND (p_config_version IS NULL OR r.config_version = p_config_version)
     GROUP BY r.product
  ),
  rows AS (
    SELECT f.product,
           CASE WHEN f.product IN ('football','ufc','f1','sports_generic','basketball')
                THEN 'sports' ELSE 'arcade' END AS grp,
           f.journal_enabled AS journal_backed,
           coalesce(agg.stakes,0)                AS stakes,
           coalesce(agg.gross_payouts,0)         AS gross_payouts,
           coalesce(agg.refunds,0)               AS refunds,
           coalesce(agg.realised_pl,0)           AS realised_pl,
           coalesce(agg.settled_positions,0)     AS settled_positions,
           CASE WHEN coalesce(agg.stakes,0) > 0
                THEN round(100 * coalesce(agg.realised_pl,0) / agg.stakes, 2) END AS hold_pct,
           coalesce(pend.open_stakes,0)          AS open_stakes,
           coalesce(pend.reserved_liability,0)   AS reserved_liability,
           coalesce(pend.max_potential_payout,0) AS max_potential_payout,
           coalesce(pend.pending_positions,0)    AS pending_positions
      FROM public.accounting_migration_flags f
      LEFT JOIN agg  ON agg.product  = f.product
      LEFT JOIN pend ON pend.product = f.product
     WHERE (p_products IS NULL OR f.product = ANY (p_products))
  )
  SELECT
    coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.grp, r.product) FROM rows r
               WHERE p_sport IS NULL OR r.grp = p_sport), '[]'::jsonb),
    coalesce((SELECT round(sum(l.debit - l.credit),2)
                FROM in_range s
                JOIN public.accounting_journal_lines l ON l.journal_id = s.journal_id
                JOIN public.accounting_accounts a ON a.id = l.account_id
               WHERE a.account_code IN ('ADMIN_ADJUSTMENT','MIGRATION_ADJUSTMENT','ROUNDING_ADJUSTMENT',
                                        'BONUS_EXPENSE','POINTS_EXPIRY')), 0)
    INTO v_products, v_adjust;

  SELECT coalesce(sum((x->>'stakes')::numeric),0),
         coalesce(sum((x->>'gross_payouts')::numeric),0),
         coalesce(sum((x->>'refunds')::numeric),0),
         coalesce(sum((x->>'realised_pl')::numeric),0)
    INTO v_stakes, v_payouts, v_refunds, v_pl
    FROM jsonb_array_elements(v_products) x;

  SELECT coalesce((
    SELECT l.balance_after FROM public.accounting_journal_lines l
      JOIN public.accounting_journals j ON j.id = l.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
       AND j.status = 'POSTED' AND j.effective_at < v_from
     ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1), 0) INTO v_open;

  SELECT coalesce((
    SELECT l.balance_after FROM public.accounting_journal_lines l
      JOIN public.accounting_journals j ON j.id = l.journal_id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
       AND j.status = 'POSTED' AND j.effective_at <= v_to
     ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1), v_open) INTO v_close;

  SELECT round(coalesce(sum(reserved_amount),0),2) INTO v_open_liability
    FROM public.accounting_liability_reservations
   WHERE status = 'ACTIVE' AND environment = p_environment AND counts_toward_available;

  SELECT jsonb_build_object(
      'open_stakes',          coalesce(sum((x->>'open_stakes')::numeric),0),
      'reserved_liability',   coalesce(sum((x->>'reserved_liability')::numeric),0),
      'max_potential_payout', coalesce(sum((x->>'max_potential_payout')::numeric),0),
      'pending_positions',    coalesce(sum((x->>'pending_positions')::numeric),0))
    INTO v_pending FROM jsonb_array_elements(v_products) x;

  v_platform := jsonb_build_object(
    'opening_bankroll',   round(v_open,2),
    'closing_bankroll',   round(v_close,2),
    'total_stakes',       round(v_stakes,2),
    'gross_payouts',      round(v_payouts,2),
    'refunds',            round(v_refunds,2),
    'adjustments',        round(v_adjust,2),
    'product_pl',         round(v_pl,2),
    'realised_pl',        round(v_pl + v_adjust,2),
    'open_liability',     round(v_open_liability,2),
    'available_bankroll', round(v_close - v_open_liability,2),
    'hold_pct',           CASE WHEN v_stakes > 0 THEN round(100 * v_pl / v_stakes, 2) END,
    'pending',            v_pending);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'params', jsonb_build_object(
       'environment', p_environment, 'from', p_from, 'to', p_to, 'basis', v_basis,
       'products', p_products, 'game', p_game, 'sport', p_sport,
       'user_id', p_user, 'config_version', p_config_version),
    'platform', v_platform,
    'groups', (
      SELECT coalesce(jsonb_agg(q.g ORDER BY q.grp), '[]'::jsonb) FROM (
        SELECT grp, jsonb_build_object(
          'group', grp,
          'totals', jsonb_build_object(
            'stakes',               round(sum(stakes),2),
            'gross_payouts',        round(sum(gross_payouts),2),
            'refunds',              round(sum(refunds),2),
            'realised_pl',          round(sum(realised_pl),2),
            'settled_positions',    sum(settled_positions),
            'open_stakes',          round(sum(open_stakes),2),
            'reserved_liability',   round(sum(reserved_liability),2),
            'max_potential_payout', round(sum(max_potential_payout),2),
            'pending_positions',    sum(pending_positions),
            'hold_pct', CASE WHEN sum(stakes) > 0
                             THEN round(100 * sum(realised_pl) / sum(stakes), 2) END),
          'products', jsonb_agg(row ORDER BY row->>'product')) AS g
          FROM (
            SELECT x AS row, x->>'grp' AS grp,
                   (x->>'stakes')::numeric stakes,
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
      'products_not_yet_journal_backed', (
        SELECT coalesce(jsonb_agg(product ORDER BY product), '[]'::jsonb)
          FROM public.accounting_migration_flags WHERE NOT journal_enabled))
  );
END $function$;

REVOKE ALL ON FUNCTION public.accounting_pl_report(public.acct_environment, timestamptz, timestamptz, text, text[], text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_pl_report(public.acct_environment, timestamptz, timestamptz, text, text[], text, text, uuid, text) TO authenticated;