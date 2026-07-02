SELECT cron.unschedule('apifootball-sync-5min-global-odds')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apifootball-sync-5min-global-odds');

SELECT cron.unschedule('apifootball-sync-1min-near-kickoff')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apifootball-sync-1min-near-kickoff');

SELECT cron.schedule(
  'apifootball-sync-5min-global-odds',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/apifootball-sync?max=6&hours=48&freshness=0.08',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zanZhZ29ldWF3bHlibnZicnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODgwNjAsImV4cCI6MjA5NjQ2NDA2MH0.vglzd_dDRiPdCt5RHfMqANGiSy7NvSXwr0jFJMRqxv0"}'::jsonb,
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
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zanZhZ29ldWF3bHlibnZicnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODgwNjAsImV4cCI6MjA5NjQ2NDA2MH0.vglzd_dDRiPdCt5RHfMqANGiSy7NvSXwr0jFJMRqxv0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);