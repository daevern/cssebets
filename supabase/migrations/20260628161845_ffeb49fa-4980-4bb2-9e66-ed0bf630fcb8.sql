
SELECT cron.schedule(
  'apifootball-sync-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/apifootball-sync?max=4&hours=36&freshness=8',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
