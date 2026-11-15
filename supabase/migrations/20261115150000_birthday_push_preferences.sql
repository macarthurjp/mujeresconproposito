-- Birthday push notifications chosen by each app user (Más → Avisos de cumpleaños):
-- any combination of "2 días antes", "1 día antes" and "el mismo día", at a
-- time of day of their choice, in the phone's own time zone.

alter table public.push_tokens
  add column if not exists avisos_reuniones boolean not null default true,
  add column if not exists cumple_avisos smallint[] not null default '{}',
  add column if not exists cumple_hora smallint not null default 9,
  add column if not exists cumple_minuto smallint not null default 0;

alter table public.push_tokens drop constraint if exists push_tokens_cumple_hora_chk;
alter table public.push_tokens add constraint push_tokens_cumple_hora_chk
  check (cumple_hora between 0 and 23 and cumple_minuto in (0, 15, 30, 45)
         and cumple_avisos <@ array[0, 1, 2]::smallint[]);

-- Anyone holding the device token may set that device's preferences
-- (same trust model as register_push_token).
create or replace function public.set_birthday_push_prefs(
  p_token text,
  p_avisos smallint[],
  p_hora smallint,
  p_minuto smallint,
  p_zona_horaria text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' then
    raise exception 'Token de notificación inválido';
  end if;
  if p_hora is null or p_hora < 0 or p_hora > 23 or p_minuto not in (0, 15, 30, 45) then
    raise exception 'Hora inválida';
  end if;
  if not (coalesce(p_avisos, '{}') <@ array[0, 1, 2]::smallint[]) then
    raise exception 'Avisos inválidos';
  end if;

  update public.push_tokens
     set cumple_avisos = coalesce(p_avisos, '{}'),
         cumple_hora = p_hora,
         cumple_minuto = p_minuto,
         zona_horaria = coalesce(left(p_zona_horaria, 64), zona_horaria),
         activo = true,
         last_seen_at = now()
   where token = p_token;

  if not found then
    raise exception 'Este dispositivo aún no está registrado para notificaciones';
  end if;
end;
$$;

revoke all on function public.set_birthday_push_prefs(text, smallint[], smallint, smallint, text) from public;
grant execute on function public.set_birthday_push_prefs(text, smallint[], smallint, smallint, text) to anon, authenticated;

-- Meeting alerts on/off per device, independent from birthday reminders
-- (unregister_push_token used to switch the whole device off).
create or replace function public.set_meeting_alerts(p_token text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_tokens
     set avisos_reuniones = coalesce(p_enabled, true), activo = true, last_seen_at = now()
   where token = p_token;
  if not found then
    raise exception 'Este dispositivo aún no está registrado para notificaciones';
  end if;
end;
$$;
revoke all on function public.set_meeting_alerts(text, boolean) from public;
grant execute on function public.set_meeting_alerts(text, boolean) to anon, authenticated;

-- One row per device / member / reminder / day so a reminder is sent once.
create table if not exists public.birthday_push_log (
  token text not null,
  member_key text not null,
  dias_antes smallint not null,
  fecha date not null,
  created_at timestamptz not null default now(),
  primary key (token, member_key, dias_antes, fecha)
);
alter table public.birthday_push_log enable row level security;
-- No policies: only the service role (Edge Function) touches it.

-- Every 15 minutes (users pick :00, :15, :30 or :45).
select cron.schedule(
  'mcp930-birthday-push',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-birthday-push',
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
