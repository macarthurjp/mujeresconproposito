-- Mobile app support:
--   1. Events get a time zone and a "notify" flag so the push function can tell
--      when a recurring meeting actually starts, plus a dedupe marker.
--   2. push_tokens stores Expo push tokens. Nobody can read it from the client;
--      the app registers through a SECURITY DEFINER RPC.
--   3. cuentas_aporte lists the donation accounts/QR codes shown in the app.
--   4. A pg_cron job calls the notify-meeting-start Edge Function every minute.
--
-- Before applying, create the Vault secret with the SAME value configured as
-- MEETING_CRON_SECRET in the Edge Function secrets:
--   select vault.create_secret('<secret>', 'meeting_cron_secret',
--                              'Autoriza el cron de avisos de reuniones MCP930');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'meeting_cron_secret') then
    raise exception 'Missing Vault secret "meeting_cron_secret". Create it before applying this migration.';
  end if;
end
$$;

-- 1. Events --------------------------------------------------------------------
alter table public.eventos add column if not exists zona_horaria text not null default 'Europe/Luxembourg';
alter table public.eventos add column if not exists notificar boolean not null default true;
-- Start time (UTC) of the last occurrence a push was sent for. Prevents duplicates.
alter table public.eventos add column if not exists ultimo_aviso_inicio timestamptz;

-- 2. Push tokens ---------------------------------------------------------------
create table if not exists public.push_tokens (
  token text primary key,
  plataforma text check (plataforma in ('ios', 'android')),
  zona_horaria text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_activo_idx on public.push_tokens (activo);

alter table public.push_tokens enable row level security;
-- Intentionally no policies: only the service role (Edge Functions) reads it.

create or replace function public.register_push_token(p_token text, p_plataforma text, p_zona_horaria text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' then
    raise exception 'Token de notificación inválido';
  end if;
  if p_plataforma is not null and p_plataforma not in ('ios', 'android') then
    raise exception 'Plataforma inválida';
  end if;

  insert into public.push_tokens (token, plataforma, zona_horaria)
  values (p_token, p_plataforma, left(p_zona_horaria, 64))
  on conflict (token) do update
    set activo = true,
        last_seen_at = now(),
        plataforma = coalesce(excluded.plataforma, public.push_tokens.plataforma),
        zona_horaria = coalesce(excluded.zona_horaria, public.push_tokens.zona_horaria);
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_tokens set activo = false, last_seen_at = now() where token = p_token;
$$;

revoke all on function public.register_push_token(text, text, text) from public;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text, text) to anon, authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;

-- 3. Donation accounts ---------------------------------------------------------
create table if not exists public.cuentas_aporte (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  metodo text not null,             -- p. ej. "PayPal", "Transferencia bancaria", "Zelle"
  titular text,                     -- nombre del titular de la cuenta
  detalle text not null,            -- IBAN, correo, número... (lo que se copia)
  nota text,                        -- referencia/concepto sugerido, BIC, etc.
  link text,                        -- enlace de pago opcional (abre en el navegador)
  qr_url text,                      -- imagen del código QR opcional
  orden integer not null default 1,
  activa boolean not null default true
);

create index if not exists cuentas_aporte_activa_orden_idx on public.cuentas_aporte (activa, orden);

alter table public.cuentas_aporte enable row level security;

drop policy if exists "public read cuentas_aporte" on public.cuentas_aporte;
create policy "public read cuentas_aporte"
on public.cuentas_aporte for select
to anon, authenticated
using (activa = true);

drop policy if exists "super admin write cuentas_aporte" on public.cuentas_aporte;
create policy "super admin write cuentas_aporte"
on public.cuentas_aporte for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Seed with the PayPal account already used on the website (only if empty).
insert into public.cuentas_aporte (metodo, titular, detalle, link, qr_url, orden)
select 'PayPal', 'Mujeres con Propósito 930 a.s.b.l.', 'Donación con PayPal',
       'https://www.paypal.com/donate/?hosted_button_id=ZVN8VQZ622B7W', 'https://mcp930.org/assets/images/paypal-qr.png', 1
where not exists (select 1 from public.cuentas_aporte);

-- 4. Cron ----------------------------------------------------------------------
do $$
declare
  target_job record;
begin
  for target_job in select jobid from cron.job where jobname = 'mcp930-meeting-start-push' loop
    perform cron.unschedule(target_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'mcp930-meeting-start-push',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/notify-meeting-start',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'meeting_cron_secret' limit 1
        )
      ),
      body := '{"scheduled":true}'::jsonb
    );
  $cron$
);
