CREATE UNIQUE INDEX IF NOT EXISTS predictions_unique_pending_selection
ON public.predictions (user_id, match_id, market_text, selection_label)
WHERE status = 'pending' AND market_text IS NOT NULL AND selection_label IS NOT NULL;