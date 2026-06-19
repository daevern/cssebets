
ALTER FUNCTION public.trust_mask_name(text, text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.trust_platform_pulse() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_recent_activity() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_payout_performance() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_community_growth() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_platform_status() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_support_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_my_badges(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trust_mask_name(text, text) FROM anon, public;
