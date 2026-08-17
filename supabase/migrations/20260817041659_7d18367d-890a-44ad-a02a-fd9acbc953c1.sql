REVOKE SELECT ON public.arcade_rps_rounds FROM authenticated;
GRANT SELECT (
  id, user_id, status, player_choice, server_choice, outcome, stake, multiplier,
  gross_return, user_net, client_seed, server_seed_hash, nonce, hmac_input,
  random_hex, verification_id, config_version, seed_id, ladder_step,
  parent_round_id, idempotency_key, prepared_at, settled_at, expires_at,
  processing_ms, server_seed_revealed_at, created_at, updated_at
) ON public.arcade_rps_rounds TO authenticated;