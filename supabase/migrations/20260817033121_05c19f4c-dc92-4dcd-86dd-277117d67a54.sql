ALTER TABLE public.ufc_events
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE INDEX IF NOT EXISTS ufc_events_starts_at_idx ON public.ufc_events (starts_at DESC);

CREATE TABLE IF NOT EXISTS public.ufc_feed_state (
  id boolean PRIMARY KEY DEFAULT true,
  last_discovery_at timestamptz,
  last_odds_at timestamptz,
  plan_limited boolean NOT NULL DEFAULT false,
  plan_message text,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ufc_feed_state_singleton CHECK (id)
);

GRANT SELECT ON public.ufc_feed_state TO authenticated;
GRANT ALL ON public.ufc_feed_state TO service_role;

ALTER TABLE public.ufc_feed_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ufc feed state"
  ON public.ufc_feed_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_ufc_feed_state_updated_at
  BEFORE UPDATE ON public.ufc_feed_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ufc_feed_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

SELECT cron.unschedule('ufc-odds-live-0');
SELECT cron.unschedule('ufc-odds-live-30');

SELECT cron.schedule('ufc-discovery-30min', '7-59/30 * * * *', $$
SELECT net.http_post(
  url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/ufc-discovery',
  headers := '{"Content-Type":"application/json","x-cron-secret":"666828f8306db9a74bafcaa4d06ec0064bbfa1fcd2ad20a2"}'::jsonb,
  body := '{}'::jsonb
);
$$);

SELECT cron.schedule('ufc-odds-5min', '*/5 * * * *', $$
SELECT net.http_post(
  url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/ufc-odds',
  headers := '{"Content-Type":"application/json","x-cron-secret":"666828f8306db9a74bafcaa4d06ec0064bbfa1fcd2ad20a2"}'::jsonb,
  body := '{}'::jsonb
);
$$);

SELECT cron.schedule('ufc-settle-2min', '*/2 * * * *', $$
SELECT net.http_post(
  url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/ufc-settle',
  headers := '{"Content-Type":"application/json","x-cron-secret":"666828f8306db9a74bafcaa4d06ec0064bbfa1fcd2ad20a2"}'::jsonb,
  body := '{}'::jsonb
);
$$);