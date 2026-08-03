-- Data API grants for the Rock-Paper-Scissors tables.
-- Players may read config + their own rounds (RLS scopes rows); the hidden
-- server_seed column is deliberately excluded from the authenticated grant so
-- a committed secret can never be read before the round is played.
GRANT SELECT ON public.arcade_rps_configurations TO authenticated;
GRANT ALL ON public.arcade_rps_configurations TO service_role;

GRANT SELECT (
  id, user_id, config_id, config_version, status, seed_id, server_seed_hash, nonce,
  prepared_at, expires_at, server_seed_revealed_at, player_choice, server_choice,
  client_seed, hmac_input, random_hex, outcome, stake, multiplier, gross_return,
  user_net, house_net, idempotency_key, verification_id, settled_at, processing_ms,
  client_reveal_ms, result_reason, created_at, updated_at
) ON public.arcade_rps_rounds TO authenticated;
GRANT ALL ON public.arcade_rps_rounds TO service_role;