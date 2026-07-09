
CREATE TABLE public.saved_bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bank_name, account_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_bank_accounts TO authenticated;
GRANT ALL ON public.saved_bank_accounts TO service_role;

ALTER TABLE public.saved_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saved bank accounts"
  ON public.saved_bank_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_saved_bank_accounts_updated_at
  BEFORE UPDATE ON public.saved_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
