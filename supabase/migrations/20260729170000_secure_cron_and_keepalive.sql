-- Secure the birthday cron with a Vault secret and generate a small external
-- database request twice daily so Free Plan inactivity is easy to monitor.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'birthday_cron_secret'
  ) then
    raise exception
      'Missing Vault secret "birthday_cron_secret". Create it before applying this migration.';
  end if;
end
$$;

create or replace function public.mcp_keepalive()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'checked_at', now()
  );
$$;

revoke all on function public.mcp_keepalive() from public;
grant execute on function public.mcp_keepalive() to anon, authenticated;

do $$
declare
  target_job record;
begin
  for target_job in
    select jobid
    from cron.job
    where jobname in (
      'mcp930-birthday-emails-hourly-check',
      'mcp930-database-keepalive'
    )
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;
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
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'birthday_cron_secret'
          limit 1
        )
      ),
      body := '{"scheduled":true}'::jsonb
    );
  $cron$
);

select cron.schedule(
  'mcp930-database-keepalive',
  '23 6,18 * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/rest/v1/rpc/mcp_keepalive',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
