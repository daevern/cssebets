ALTER TABLE public.event_comments
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_preview_url text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_provider text;

ALTER TABLE public.event_comments DROP CONSTRAINT IF EXISTS event_comments_body_check;
ALTER TABLE public.event_comments
  ADD CONSTRAINT event_comments_body_check
  CHECK (char_length(body) <= 500 AND (char_length(body) >= 1 OR media_url IS NOT NULL));

ALTER TABLE public.event_comments
  ADD CONSTRAINT event_comments_media_provider_check
  CHECK (media_provider IS NULL OR media_provider IN ('klipy'));