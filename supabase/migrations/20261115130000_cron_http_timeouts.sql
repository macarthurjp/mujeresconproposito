-- pg_net waits 5 s by default; Edge Function cold starts can take longer, so
-- the cron log shows "Timeout of 5000 ms" even though the function ran.
-- Re-schedule the three jobs (same names, same schedules) with a 30 s timeout.

select cron.schedule(
  'mcp930-meeting-start-push',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/notify-meeting-start',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meeting_cron_secret' limit 1)
      ),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'mcp930-birthday-emails-hourly-check',
  '0 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-birthday-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'birthday_cron_secret' limit 1)
      ),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'mcp930-birthday-reminders-hourly-check',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-birthday-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'birthday_cron_secret' limit 1)
      ),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
