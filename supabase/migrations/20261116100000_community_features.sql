-- Community features (2026-11-16):
--  1. Push for new content (devotionals, videos, destacadas)
--  3. Sign-ups for special events (destacadas with registration)
--  6. Follow-up of new members (Únete)
--  7. Push broadcasts from the panel, by community
--  8. Statistics (reads, "Unirme" taps, registrations)

-- ---------------------------------------------------------------------------
-- Devices: content alerts on/off and the community chosen in the app.
alter table public.push_tokens
  add column if not exists avisos_contenido boolean not null default true,
  add column if not exists comunidad text;

alter table public.push_tokens drop constraint if exists push_tokens_comunidad_chk;
alter table public.push_tokens add constraint push_tokens_comunidad_chk
  check (comunidad is null or comunidad in ('Europa', 'Estados Unidos', 'República Dominicana'));

create or replace function public.set_device_preferences(p_token text, p_avisos_contenido boolean, p_comunidad text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_comunidad is not null and p_comunidad not in ('Europa', 'Estados Unidos', 'República Dominicana') then
    raise exception 'Comunidad inválida';
  end if;
  update public.push_tokens
     set avisos_contenido = coalesce(p_avisos_contenido, true),
         comunidad = p_comunidad,
         activo = true,
         last_seen_at = now()
   where token = p_token;
  if not found then raise exception 'Este dispositivo aún no está registrado para notificaciones'; end if;
end; $$;
revoke all on function public.set_device_preferences(text, boolean, text) from public;
grant execute on function public.set_device_preferences(text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. New-content push: a trigger queues one notification per new item; the
--    Edge Function send-content-push (cron, every minute) delivers it.
create table if not exists public.content_push_queue (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('devocional', 'video', 'destacada')),
  ref text not null,
  titulo text not null,
  cuerpo text,
  ruta text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tipo, ref)
);
alter table public.content_push_queue enable row level security;
-- No policies: service role only.

create or replace function public.queue_content_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  became_visible boolean;
begin
  if TG_TABLE_NAME = 'devocionales' then
    became_visible := new.publicado is true and new.fecha_publicacion is not null and new.fecha_publicacion <= now() + interval '5 minutes'
      and (TG_OP = 'INSERT' or old.publicado is distinct from true);
    if became_visible then
      insert into public.content_push_queue (tipo, ref, titulo, cuerpo, ruta)
      values ('devocional', new.id::text, 'Nuevo devocional', coalesce(new.titulo, 'Una nueva reflexión para ti'), '/devocional/' || new.slug)
      on conflict (tipo, ref) do nothing;
    end if;
  elsif TG_TABLE_NAME = 'youtube' then
    became_visible := new.activa is true and (TG_OP = 'INSERT' or old.activa is distinct from true);
    if became_visible then
      insert into public.content_push_queue (tipo, ref, titulo, cuerpo, ruta)
      values ('video', new.id::text, 'Nuevo video', coalesce(new.titulo, 'Un nuevo mensaje para ti'), '/')
      on conflict (tipo, ref) do nothing;
    end if;
  elsif TG_TABLE_NAME = 'destacadas' then
    became_visible := new.activa is true and (TG_OP = 'INSERT' or old.activa is distinct from true);
    if became_visible then
      insert into public.content_push_queue (tipo, ref, titulo, cuerpo, ruta)
      values ('destacada', new.id::text, 'Nuevo evento', coalesce(nullif(new.nombre, ''), new.titulo, 'Hay algo nuevo en la comunidad'), '/destacadas')
      on conflict (tipo, ref) do nothing;
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.queue_content_push() from public, anon, authenticated;

drop trigger if exists devocionales_queue_push on public.devocionales;
create trigger devocionales_queue_push after insert or update of publicado on public.devocionales
  for each row execute function public.queue_content_push();
drop trigger if exists youtube_queue_push on public.youtube;
create trigger youtube_queue_push after insert or update of activa on public.youtube
  for each row execute function public.queue_content_push();
drop trigger if exists destacadas_queue_push on public.destacadas;
create trigger destacadas_queue_push after insert or update of activa on public.destacadas
  for each row execute function public.queue_content_push();

-- ---------------------------------------------------------------------------
-- 3. Special events with registration (a "destacada" can open sign-ups).
alter table public.destacadas
  add column if not exists inscripcion_abierta boolean not null default false,
  add column if not exists cupo integer,
  add column if not exists fecha_evento timestamptz,
  add column if not exists lugar text;

create table if not exists public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  destacada_id text not null,
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  email text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  telefono text,
  acompanantes smallint not null default 0 check (acompanantes between 0 and 10),
  created_at timestamptz not null default now()
);
create unique index if not exists inscripciones_unique on public.inscripciones (destacada_id, lower(email));
create index if not exists inscripciones_destacada_idx on public.inscripciones (destacada_id);
alter table public.inscripciones enable row level security;
drop policy if exists "team reads inscripciones" on public.inscripciones;
create policy "team reads inscripciones" on public.inscripciones for select to authenticated
  using (public.is_super_admin() or public.has_permission('read_export'));
drop policy if exists "super admin deletes inscripciones" on public.inscripciones;
create policy "super admin deletes inscripciones" on public.inscripciones for delete to authenticated
  using (public.is_super_admin());

-- Public: sign up (with capacity check) and read the count.
create or replace function public.inscribirse(p_destacada text, p_nombre text, p_email text, p_telefono text default null, p_acompanantes smallint default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev record;
  ocupados integer;
  personas integer := 1 + greatest(0, least(coalesce(p_acompanantes, 0), 10));
begin
  select inscripcion_abierta, cupo, activa into ev from public.destacadas where id::text = p_destacada;
  if not found or ev.activa is not true or ev.inscripcion_abierta is not true then
    raise exception 'Las inscripciones de este evento no están abiertas.';
  end if;
  select coalesce(sum(1 + acompanantes), 0) into ocupados from public.inscripciones where destacada_id = p_destacada;
  if ev.cupo is not null and ocupados + personas > ev.cupo then
    raise exception 'Lo sentimos, ya no quedan plazas.';
  end if;
  insert into public.inscripciones (destacada_id, nombre, email, telefono, acompanantes)
  values (p_destacada, trim(p_nombre), lower(trim(p_email)), nullif(trim(coalesce(p_telefono, '')), ''), personas - 1);
  return jsonb_build_object('ok', true, 'ocupados', ocupados + personas, 'cupo', ev.cupo);
exception when unique_violation then
  raise exception 'Ya estás inscrita en este evento con ese correo.';
end; $$;
revoke all on function public.inscribirse(text, text, text, text, smallint) from public;
grant execute on function public.inscribirse(text, text, text, text, smallint) to anon, authenticated;

create or replace function public.plazas_evento(p_destacada text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ocupados', coalesce((select sum(1 + acompanantes) from public.inscripciones where destacada_id = p_destacada), 0),
    'cupo', (select cupo from public.destacadas where id::text = p_destacada)
  );
$$;
revoke all on function public.plazas_evento(text) from public;
grant execute on function public.plazas_evento(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Follow-up of new members.
alter table public.unirse
  add column if not exists estado_seguimiento text not null default 'nueva',
  add column if not exists contactada_por text,
  add column if not exists notas_seguimiento text,
  add column if not exists seguimiento_at timestamptz;
alter table public.unirse drop constraint if exists unirse_estado_seguimiento_chk;
alter table public.unirse add constraint unirse_estado_seguimiento_chk
  check (estado_seguimiento in ('nueva', 'contactada', 'integrada', 'sin_respuesta'));

-- Super Admin and Managers can update the follow-up (and only that).
create or replace function public.set_member_followup(p_id uuid, p_estado text, p_contactada_por text, p_notas text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_super_admin() or public.has_permission('read_export')) then
    raise exception 'No tienes permiso para actualizar el seguimiento.' using errcode = '42501';
  end if;
  if p_estado not in ('nueva', 'contactada', 'integrada', 'sin_respuesta') then raise exception 'Estado inválido'; end if;
  update public.unirse
     set estado_seguimiento = p_estado,
         contactada_por = nullif(left(trim(coalesce(p_contactada_por, '')), 120), ''),
         notas_seguimiento = nullif(left(trim(coalesce(p_notas, '')), 2000), ''),
         seguimiento_at = now()
   where id = p_id;
end; $$;
revoke all on function public.set_member_followup(uuid, text, text, text) from public, anon;
grant execute on function public.set_member_followup(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Broadcast log (who sent what, to whom).
create table if not exists public.push_broadcasts (
  id bigint generated always as identity primary key,
  titulo text not null,
  mensaje text not null,
  comunidad text,
  enviados integer not null default 0,
  enviado_por uuid,
  created_at timestamptz not null default now()
);
alter table public.push_broadcasts enable row level security;
drop policy if exists "super admin reads broadcasts" on public.push_broadcasts;
create policy "super admin reads broadcasts" on public.push_broadcasts for select to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 8. Statistics: anonymous daily counters.
create table if not exists public.metricas_diarias (
  dia date not null default current_date,
  tipo text not null check (tipo in ('lectura_devocional', 'unirme_reunion')),
  ref text not null,
  total integer not null default 0,
  primary key (dia, tipo, ref)
);
alter table public.metricas_diarias enable row level security;
drop policy if exists "team reads metrics" on public.metricas_diarias;
create policy "team reads metrics" on public.metricas_diarias for select to authenticated
  using (public.is_super_admin() or public.has_permission('read_export'));

create or replace function public.registrar_metrica(p_tipo text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tipo not in ('lectura_devocional', 'unirme_reunion') or p_ref is null or length(p_ref) > 120 then return; end if;
  insert into public.metricas_diarias (dia, tipo, ref, total) values (current_date, p_tipo, p_ref, 1)
  on conflict (dia, tipo, ref) do update set total = public.metricas_diarias.total + 1;
end; $$;
revoke all on function public.registrar_metrica(text, text) from public;
grant execute on function public.registrar_metrica(text, text) to anon, authenticated;

-- One call for the stats screen (web + app).
create or replace function public.estadisticas_panel()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not (public.is_super_admin() or public.has_permission('read_export')) then
    raise exception 'No tienes permiso para ver estadísticas.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'miembros_total', (select count(*) from public.unirse),
    'registros_por_mes', (select coalesce(jsonb_agg(x order by x->>'mes'), '[]') from (
        select jsonb_build_object('mes', to_char(date_trunc('month', created_at), 'YYYY-MM'), 'total', count(*)) x
        from public.unirse where created_at >= date_trunc('month', now()) - interval '11 months'
        group by date_trunc('month', created_at)) m),
    'por_comunidad', (select coalesce(jsonb_agg(jsonb_build_object('comunidad', coalesce(comunidad, 'Sin indicar'), 'total', n) order by n desc), '[]')
        from (select comunidad, count(*) n from public.unirse group by comunidad) c),
    'seguimiento', (select coalesce(jsonb_object_agg(estado_seguimiento, n), '{}') from (select estado_seguimiento, count(*) n from public.unirse group by 1) s),
    'dispositivos_app', (select count(*) from public.push_tokens where activo),
    'devocionales_leidos', (select coalesce(jsonb_agg(jsonb_build_object('titulo', d.titulo, 'lecturas', t.total) order by t.total desc), '[]')
        from (select ref, sum(total) total from public.metricas_diarias where tipo = 'lectura_devocional' and dia >= current_date - 30 group by ref order by 2 desc limit 5) t
        join public.devocionales d on d.slug = t.ref),
    'unirme_reuniones', (select coalesce(jsonb_agg(jsonb_build_object('titulo', e.titulo, 'clics', t.total) order by t.total desc), '[]')
        from (select ref, sum(total) total from public.metricas_diarias where tipo = 'unirme_reunion' and dia >= current_date - 30 group by ref) t
        join public.eventos e on e.id::text = t.ref),
    'inscripciones', (select coalesce(jsonb_agg(jsonb_build_object('evento', coalesce(nullif(de.nombre, ''), de.titulo), 'personas', t.personas, 'cupo', de.cupo) order by t.personas desc), '[]')
        from (select destacada_id, sum(1 + acompanantes) personas from public.inscripciones group by 1) t
        join public.destacadas de on de.id::text = t.destacada_id)
  ) into result;
  return result;
end; $$;
revoke all on function public.estadisticas_panel() from public, anon;
grant execute on function public.estadisticas_panel() to authenticated;

-- ---------------------------------------------------------------------------
-- Cron: deliver queued content pushes every minute (same secret as meetings).
select cron.schedule(
  'mcp930-content-push',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/send-content-push',
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

-- ---------------------------------------------------------------------------
-- Audit trail on admin-managed content: when and by whom it was created and
-- last modified. Filled by the database (cannot be faked from the client).
create or replace function public.set_audit_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid := auth.uid();
  who_name text;
begin
  if who is not null then
    select coalesce(nullif(trim(nombre), ''), email) into who_name from public.user_roles where user_id = who;
  end if;
  if TG_OP = 'INSERT' then
    new.creado_at := now();
    new.creado_por := who;
    new.creado_por_nombre := who_name;
  else
    new.creado_at := old.creado_at;
    new.creado_por := old.creado_por;
    new.creado_por_nombre := old.creado_por_nombre;
  end if;
  new.modificado_at := now();
  new.modificado_por := who;
  new.modificado_por_nombre := who_name;
  return new;
end; $$;
revoke all on function public.set_audit_fields() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['destacadas', 'eventos', 'youtube', 'galeria'] loop
    execute format('alter table public.%I
      add column if not exists creado_at timestamptz,
      add column if not exists creado_por uuid,
      add column if not exists creado_por_nombre text,
      add column if not exists modificado_at timestamptz,
      add column if not exists modificado_por uuid,
      add column if not exists modificado_por_nombre text', t);
    -- Existing rows stay without a creation date (unknown); new rows get now().
    execute format('alter table public.%I alter column creado_at set default now()', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
  end loop;
end $$;
