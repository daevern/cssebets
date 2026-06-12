
REVOKE EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.poisson_pmf(numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.poisson_pmf(numeric, integer) TO service_role;
