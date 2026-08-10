CREATE TABLE IF NOT EXISTS public.football_event_analytics (
  sports_event_id UUID PRIMARY KEY REFERENCES public.sports_events(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.football_event_analytics TO service_role;

ALTER TABLE public.football_event_analytics ENABLE ROW LEVEL SECURITY;