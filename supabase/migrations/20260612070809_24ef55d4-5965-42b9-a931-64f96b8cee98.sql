
-- 1. Force password change flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;

-- 2. Conversations
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_user_message_at TIMESTAMPTZ,
  last_staff_message_at TIMESTAMPTZ,
  user_last_read_at TIMESTAMPTZ,
  staff_last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_conversations TO authenticated;
GRANT ALL ON public.support_conversations TO service_role;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own conversation" ON public.support_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_staff_role(auth.uid()));
CREATE POLICY "user creates own conversation" ON public.support_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user/staff update conversation" ON public.support_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR private.has_staff_role(auth.uid()));

-- 3. Messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','staff')),
  body TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON public.support_messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own messages" ON public.support_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_conversations c
            WHERE c.id = conversation_id
              AND (c.user_id = auth.uid() OR private.has_staff_role(auth.uid())))
  );
CREATE POLICY "user/staff inserts own message" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.support_conversations c
            WHERE c.id = conversation_id
              AND ((sender_role = 'user' AND c.user_id = auth.uid())
                OR (sender_role = 'staff' AND private.has_staff_role(auth.uid()))))
  );

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS trg_support_conv_updated ON public.support_conversations;
CREATE TRIGGER trg_support_conv_updated BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Storage policies for support-attachments bucket
DROP POLICY IF EXISTS "support attach: user reads own" ON storage.objects;
CREATE POLICY "support attach: user reads own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.has_staff_role(auth.uid())
  ));

DROP POLICY IF EXISTS "support attach: user uploads own" ON storage.objects;
CREATE POLICY "support attach: user uploads own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.has_staff_role(auth.uid())
  ));
