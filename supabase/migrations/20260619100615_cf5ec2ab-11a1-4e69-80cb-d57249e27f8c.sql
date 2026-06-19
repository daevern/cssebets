-- Grant public (anon) access to safe, aggregated trust functions for the landing page.
-- These are SECURITY DEFINER and return only masked / aggregate data.
GRANT EXECUTE ON FUNCTION public.trust_platform_pulse() TO anon;
GRANT EXECUTE ON FUNCTION public.trust_recent_activity() TO anon;
GRANT EXECUTE ON FUNCTION public.trust_payout_performance() TO anon;
GRANT EXECUTE ON FUNCTION public.trust_platform_status() TO anon;