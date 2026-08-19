ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comments_banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comments_banned_by UUID;

CREATE TABLE public.event_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('wc','football','f1','ufc')),
  event_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  parent_id UUID REFERENCES public.event_comments(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_comments TO authenticated;
GRANT ALL ON public.event_comments TO service_role;

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live comments"
  ON public.event_comments FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can read all comments"
  ON public.event_comments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can post their own comments"
  ON public.event_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.comments_banned_at IS NOT NULL
    )
  );

CREATE POLICY "Users can soft-delete their own comments"
  ON public.event_comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can moderate comments"
  ON public.event_comments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_event_comments_event ON public.event_comments (event_kind, event_id, created_at DESC);
CREATE INDEX idx_event_comments_user ON public.event_comments (user_id, created_at DESC);
CREATE INDEX idx_event_comments_parent ON public.event_comments (parent_id);

CREATE TABLE public.event_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.event_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

GRANT SELECT ON public.event_comment_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.event_comment_likes TO authenticated;
GRANT ALL ON public.event_comment_likes TO service_role;

ALTER TABLE public.event_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes"
  ON public.event_comment_likes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users manage their own likes"
  ON public.event_comment_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove their own likes"
  ON public.event_comment_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.event_comments_enforce_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grandparent UUID;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO grandparent FROM public.event_comments WHERE id = NEW.parent_id;
    IF grandparent IS NOT NULL THEN
      RAISE EXCEPTION 'Replies can only be one level deep';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_comments_depth
  BEFORE INSERT ON public.event_comments
  FOR EACH ROW EXECUTE FUNCTION public.event_comments_enforce_depth();

CREATE OR REPLACE FUNCTION public.event_comment_likes_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.event_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSE
    UPDATE public.event_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_event_comment_likes_sync
  AFTER INSERT OR DELETE ON public.event_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.event_comment_likes_sync();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_event_comments_updated_at
  BEFORE UPDATE ON public.event_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();