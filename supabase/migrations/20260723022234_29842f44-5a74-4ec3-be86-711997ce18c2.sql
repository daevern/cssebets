INSERT INTO public.sports_feature_flags (key, enabled, updated_at)
VALUES
  ('mls_enabled', true, now()),
  ('brasileirao_enabled', true, now())
ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();