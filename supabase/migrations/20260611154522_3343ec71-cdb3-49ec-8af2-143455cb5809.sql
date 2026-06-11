
-- 1) Revoke place_bet_atomic from authenticated; server fn uses service_role
REVOKE EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, public.prediction_market, text, numeric, numeric, uuid, numeric) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, public.prediction_market, text, numeric, numeric, uuid, numeric) TO service_role;

-- 2) Hide sensitive profile columns from client roles (admin access goes through service_role server fns)
REVOKE SELECT (suspended, is_simulation) ON public.profiles FROM authenticated, anon;

-- 3) Hide plaintext bank account number from client reads on payout_requests
REVOKE SELECT (bank_account_number) ON public.payout_requests FROM authenticated, anon;
