CREATE TABLE IF NOT EXISTS public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.page_views TO anon;
GRANT SELECT, INSERT ON public.page_views TO authenticated;
GRANT ALL ON public.page_views TO service_role;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can record page views" ON public.page_views;
CREATE POLICY "Anyone can record page views"
ON public.page_views
FOR INSERT
TO anon, authenticated
WITH CHECK (path = '/');

DROP POLICY IF EXISTS "Authenticated users can read page views" ON public.page_views;
CREATE POLICY "Authenticated users can read page views"
ON public.page_views
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.trust_community_growth()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'views_this_week', (SELECT COUNT(*) FROM public.page_views WHERE path = '/'),
    'members_this_week', (SELECT COUNT(*) FROM public.profiles WHERE is_simulation = false),
    'bets_this_week', (SELECT COUNT(*) FROM public.predictions WHERE is_simulation = false),
    'points_paid_out_this_week', (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.payout_requests WHERE status = 'completed'),
    'updated_at', now()
  );
$$;

REVOKE ALL ON FUNCTION public.trust_community_growth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_community_growth() TO anon;
GRANT EXECUTE ON FUNCTION public.trust_community_growth() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_payout_performance()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH payout_totals AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_payouts,
      COUNT(*) FILTER (WHERE status IN ('completed','rejected_by_admin','rejected_by_user')) AS finalized_payouts
    FROM public.payout_requests
  )
  SELECT jsonb_build_object(
    'winner_payout_points', (SELECT COALESCE(SUM(potential_return), 0)::numeric FROM public.predictions WHERE is_simulation = false AND status = 'won'),
    'bets_placed', (SELECT COUNT(*) FROM public.predictions WHERE is_simulation = false),
    'payout_success_rate', CASE WHEN (SELECT finalized_payouts FROM payout_totals) > 0
      THEN ((SELECT completed_payouts FROM payout_totals)::float / (SELECT finalized_payouts FROM payout_totals))
      ELSE 1 END,
    'updated_at', now()
  );
$$;

REVOKE ALL ON FUNCTION public.trust_payout_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trust_payout_performance() TO anon;
GRANT EXECUTE ON FUNCTION public.trust_payout_performance() TO authenticated;