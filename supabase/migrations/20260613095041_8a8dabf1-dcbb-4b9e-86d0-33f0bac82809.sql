REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) TO service_role;