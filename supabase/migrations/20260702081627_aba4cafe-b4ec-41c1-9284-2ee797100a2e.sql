ALTER PUBLICATION supabase_realtime ADD TABLE public.match_odds_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_odds_snapshots;

SELECT cron.unschedule('apifootball-sync-30min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apifootball-sync-30min');

SELECT cron.schedule(
  'apifootball-sync-5min-global-odds',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/apifootball-sync?max=6&hours=48&freshness=0.08',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'apifootball-sync-1min-near-kickoff',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/apifootball-sync?max=3&hours=4&freshness=0.015',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);