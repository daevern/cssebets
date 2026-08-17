-- League chat: members can read all messages and insert their own.

CREATE TABLE IF NOT EXISTS public.league_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) >= 1 AND char_length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_messages_league_created_idx
  ON public.league_messages (league_id, created_at DESC);

ALTER TABLE public.league_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "league_messages_select_members" ON public.league_messages;
CREATE POLICY "league_messages_select_members" ON public.league_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members m
      WHERE m.league_id = league_messages.league_id
        AND m.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "league_messages_insert_own" ON public.league_messages;
CREATE POLICY "league_messages_insert_own" ON public.league_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.league_members m
      WHERE m.league_id = league_messages.league_id
        AND m.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.league_messages TO authenticated;
GRANT ALL ON public.league_messages TO service_role;
