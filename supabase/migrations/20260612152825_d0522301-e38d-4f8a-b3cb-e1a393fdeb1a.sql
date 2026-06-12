
-- Lock down new SECURITY DEFINER functions to service_role only.
REVOKE EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_new_markets_for_match(uuid, int, int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_new_markets_for_match(uuid, int, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int) TO service_role;

-- View should run with invoker's permissions, not creator's.
ALTER VIEW public.match_market_exposure SET (security_invoker = true);
