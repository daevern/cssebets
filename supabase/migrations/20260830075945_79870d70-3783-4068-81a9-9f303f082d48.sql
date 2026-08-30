ALTER TABLE public.ufc_feed_state
  ADD COLUMN IF NOT EXISTS api_request_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS api_request_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.claim_api_mma_request(p_limit integer DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_state public.ufc_feed_state%ROWTYPE;
BEGIN
  IF p_limit < 1 OR p_limit > 60 THEN
    RAISE EXCEPTION 'invalid API-MMA request limit';
  END IF;

  INSERT INTO public.ufc_feed_state (id)
  VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_state
  FROM public.ufc_feed_state
  WHERE id = true
  FOR UPDATE;

  IF v_state.api_request_window_started_at IS NULL
     OR v_now - v_state.api_request_window_started_at >= interval '1 minute' THEN
    UPDATE public.ufc_feed_state
    SET api_request_window_started_at = v_now,
        api_request_count = 1
    WHERE id = true;
    RETURN true;
  END IF;

  IF v_state.api_request_count >= p_limit THEN
    RETURN false;
  END IF;

  UPDATE public.ufc_feed_state
  SET api_request_count = api_request_count + 1
  WHERE id = true;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_api_mma_request(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_api_mma_request(integer) TO service_role;