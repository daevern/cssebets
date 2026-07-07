REVOKE EXECUTE ON FUNCTION public.enforce_real_match_trusted_market_odds() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reprice_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_real_match_trusted_market_odds() TO service_role;
GRANT EXECUTE ON FUNCTION public.reprice_match_market_odds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) TO service_role;