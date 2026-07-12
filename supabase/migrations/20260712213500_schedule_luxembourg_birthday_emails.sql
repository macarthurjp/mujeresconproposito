-- Check hourly so daylight-saving changes cannot shift the intended local time.
-- The Edge Function only processes the full list during the 08:00 hour in
-- Europe/Luxembourg. New registrations are checked immediately by member ID.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'mcp930-birthday-emails-hourly-check'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'mcp930-birthday-emails-hourly-check',
  '0 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-birthday-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX'
      ),
      body := '{"scheduled":true}'::jsonb
    );
  $cron$
);
