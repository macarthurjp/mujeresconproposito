-- 1. Birthday reminders two days ahead, sent to accounts with the
--    "birthday_calendar" permission (assigned in Admin → Usuarios y roles).
-- 2. Each event gets the time zone its schedule is written in, so the website
--    and the app convert it correctly across summer/winter time.
--
-- Requires 20261114120000_add_mobile_app_push_and_donation_accounts.sql
-- (adds eventos.zona_horaria) and the existing Vault secret
-- "birthday_cron_secret" (same value as BIRTHDAY_CRON_SECRET).

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'birthday_cron_secret') then
    raise exception 'Missing Vault secret "birthday_cron_secret".';
  end if;
end
$$;

-- 1. Reminder log: one row per birthday date already announced (prevents duplicates).
create table if not exists public.birthday_reminder_log (
  target_date date primary key,
  sent_at timestamptz not null default now(),
  recipients integer not null default 0,
  birthdays integer not null default 0
);

alter table public.birthday_reminder_log enable row level security;
-- No policies: only the service role (Edge Function) touches it.

do $$
declare
  target_job record;
begin
  for target_job in select jobid from cron.job where jobname = 'mcp930-birthday-reminders-hourly-check' loop
    perform cron.unschedule(target_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'mcp930-birthday-reminders-hourly-check',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-birthday-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'birthday_cron_secret' limit 1
        )
      ),
      body := '{"scheduled":true}'::jsonb
    );
  $cron$
);

-- 2. Event time zones: "Europa" events are written in Luxembourg time,
--    everything else in Dominican Republic time (no daylight saving).
update public.eventos
set zona_horaria = case
  when titulo ilike '%europa%' or titulo ilike '%europe%' then 'Europe/Luxembourg'
  else 'America/Santo_Domingo'
end;
