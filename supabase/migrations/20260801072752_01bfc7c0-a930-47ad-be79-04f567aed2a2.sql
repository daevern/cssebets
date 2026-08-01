DO $do$
DECLARE src text; before text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'accounting_pl_report' AND pronamespace = 'public'::regnamespace;
  before := src;

  src := replace(src,
$q1$  scope AS (
    SELECT j.id AS journal_id, j.product, j.journal_type, j.effective_at,$q1$,
$q2$  pstate AS (
    SELECT p.reference_type, p.reference_id, ps.outcome AS pos_outcome, ps.is_terminal
      FROM (SELECT DISTINCT reference_type, reference_id FROM j
             WHERE reference_id ~ '^[0-9a-fA-F-]{36}$') p
      LEFT JOIN LATERAL public.accounting_position_state(p.reference_type, p.reference_id::uuid) ps ON true
  ),
  active_hold AS (
    SELECT r.reference_type, r.reference_id::text AS reference_id
      FROM public.accounting_liability_reservations r
     WHERE r.environment = p_environment AND r.status = 'ACTIVE'
  ),
  scope AS (
    SELECT j.id AS journal_id, j.product, j.journal_type, j.effective_at,$q2$);

  src := replace(src,
$q1$             ELSE CASE WHEN j.journal_type = 'STAKE_PLACED'
                         THEN coalesce(s.settled_at, rl.released_at)
                       ELSE coalesce(s.settled_at, j.effective_at) END
           END AS attributed_at,
           (j.journal_type = 'STAKE_PLACED'
              AND s.settled_at IS NULL AND rl.released_at IS NOT NULL) AS zero_payout_settled$q1$,
$q2$             ELSE CASE WHEN j.journal_type = 'STAKE_PLACED'
                         THEN coalesce(s.settled_at,
                                CASE WHEN coalesce(ps.is_terminal,false)
                                       AND ps.pos_outcome = 'LOSS'
                                       AND ah.reference_id IS NULL
                                     THEN rl.released_at END)
                       ELSE coalesce(s.settled_at, j.effective_at) END
           END AS attributed_at,
           ps.pos_outcome,
           coalesce(ps.is_terminal, false) AS pos_terminal,
           (ah.reference_id IS NOT NULL) AS has_active_hold,
           (j.journal_type = 'STAKE_PLACED'
              AND s.settled_at IS NULL AND rl.released_at IS NOT NULL
              AND ah.reference_id IS NULL
              AND coalesce(ps.is_terminal, false)
              AND ps.pos_outcome = 'LOSS') AS zero_payout_settled,
           (j.journal_type = 'STAKE_PLACED'
              AND s.settled_at IS NULL AND rl.released_at IS NOT NULL
              AND ah.reference_id IS NULL
              AND coalesce(ps.pos_outcome, 'UNKNOWN')
                  NOT IN ('LOSS','WIN','PUSH','VOID','REVERSED','CANCELLED')) AS unclassified_release$q2$);

  src := replace(src,
$q1$      LEFT JOIN place  p ON p.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND p.reference_id   IS NOT DISTINCT FROM j.reference_id
  ),$q1$,
$q2$      LEFT JOIN place  p ON p.reference_type IS NOT DISTINCT FROM j.reference_type
                        AND p.reference_id   IS NOT DISTINCT FROM j.reference_id
      LEFT JOIN pstate ps ON ps.reference_type IS NOT DISTINCT FROM j.reference_type
                         AND ps.reference_id   IS NOT DISTINCT FROM j.reference_id
      LEFT JOIN active_hold ah ON ah.reference_type IS NOT DISTINCT FROM j.reference_type
                              AND ah.reference_id   IS NOT DISTINCT FROM j.reference_id
  ),$q2$);

  src := replace(src,
$q1$           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type = 'PAYOUT_SETTLED'
                                                  OR s.zero_payout_settled) AS settled_positions$q1$,
$q2$           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type = 'PAYOUT_SETTLED'
                                                  OR s.zero_payout_settled) AS settled_positions,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type = 'PAYOUT_SETTLED'
                                                  AND s.pos_outcome = 'WIN') AS outcome_win,
           count(DISTINCT s.journal_id) FILTER (WHERE s.zero_payout_settled
                                                  OR (s.journal_type = 'PAYOUT_SETTLED'
                                                      AND s.pos_outcome = 'LOSS')) AS outcome_loss,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type <> 'STAKE_PLACED'
                                                  AND s.pos_outcome = 'PUSH') AS outcome_push,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type <> 'STAKE_PLACED'
                                                  AND s.pos_outcome = 'VOID') AS outcome_void,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type <> 'STAKE_PLACED'
                                                  AND s.pos_outcome = 'REVERSED') AS outcome_reversed,
           count(DISTINCT s.journal_id) FILTER (WHERE s.journal_type <> 'STAKE_PLACED'
                                                  AND s.pos_outcome = 'CANCELLED') AS outcome_cancelled,
           count(DISTINCT s.journal_id) FILTER (WHERE s.unclassified_release) AS unclassified_positions$q2$);

  src := replace(src,
$q1$           coalesce(agg.settled_positions,0)     AS settled_positions,$q1$,
$q2$           coalesce(agg.settled_positions,0)     AS settled_positions,
           jsonb_build_object(
             'win', coalesce(agg.outcome_win,0),
             'loss', coalesce(agg.outcome_loss,0),
             'push', coalesce(agg.outcome_push,0),
             'void', coalesce(agg.outcome_void,0),
             'reversed', coalesce(agg.outcome_reversed,0),
             'cancelled', coalesce(agg.outcome_cancelled,0))  AS settled_outcomes,
           coalesce(agg.unclassified_positions,0) AS unclassified_positions,$q2$);

  IF src = before THEN
    RAISE EXCEPTION 'PL_REPORT_PATCH_NO_OP: expected source markers not found';
  END IF;

  EXECUTE src;
END $do$;
