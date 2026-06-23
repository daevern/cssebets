
CREATE OR REPLACE FUNCTION public.trust_payout_performance()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH settled AS (
    SELECT status, potential_return
    FROM public.predictions
    WHERE is_simulation = false
      AND status IN ('won', 'lost', 'void')
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'won') AS n_won,
      COUNT(*) FILTER (WHERE status IN ('won', 'lost')) AS n_decided,
      COALESCE(MAX(potential_return) FILTER (WHERE status = 'won'), 0)::numeric AS largest_win
    FROM settled
  )
  SELECT jsonb_build_object(
    'winning_bets', (SELECT n_won FROM totals),
    'largest_win_points', (SELECT largest_win FROM totals),
    'success_rate', CASE WHEN (SELECT n_decided FROM totals) > 0
      THEN ((SELECT n_won FROM totals)::float / (SELECT n_decided FROM totals)) ELSE NULL END,
    'updated_at', now()
  );
$$;
