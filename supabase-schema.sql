-- Supabase / PostgreSQL schema for Mujeres con Proposito
-- Ejecuta este script en el SQL Editor de Supabase si necesitas recrear o
-- completar columnas. Las tablas coinciden con assets/js/main.js.

create extension if not exists "pgcrypto";

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text not null default '',
  is_super_admin boolean not null default false,
  permissions text[] not null default '{read_only}',
  is_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles add column if not exists nombre text not null default '';

insert into public.user_roles (user_id, email, is_super_admin, permissions, is_revoked)
select id, lower(email), true, '{read_only}', false from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_super_admin from public.user_roles where user_id = auth.uid()), false);
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select is_super_admin or (not is_revoked and p = any(permissions))
     from public.user_roles where user_id = auth.uid()),
    p = 'read_only'
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.assign_default_user_role()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, email, is_super_admin, permissions, is_revoked)
  values (new.id, lower(new.email), false, '{read_only}', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists assign_default_user_role_after_signup on auth.users;
create trigger assign_default_user_role_after_signup
after insert on auth.users for each row execute function public.assign_default_user_role();

-- Registro del formulario "Unirse".
create table if not exists public.unirse (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  apellido text not null,
  email text not null,
  telefono text,
  fecha_nacimiento date,
  estatus_matrimonial text,
  pais_nacimiento text,
  pais_residencia text,
  cristiana text,
  comunidad text,
  comments text,
  hijos integer not null default 0,
  birthday_event_id text,
  ultimo_correo_cumpleanos timestamptz
);

alter table public.unirse add column if not exists created_at timestamptz not null default now();
alter table public.unirse add column if not exists nombre text;
alter table public.unirse add column if not exists apellido text;
alter table public.unirse add column if not exists email text;
alter table public.unirse add column if not exists telefono text;
alter table public.unirse add column if not exists fecha_nacimiento date;
alter table public.unirse add column if not exists estatus_matrimonial text;
alter table public.unirse add column if not exists pais_nacimiento text;
alter table public.unirse add column if not exists pais_residencia text;
alter table public.unirse add column if not exists cristiana text;
alter table public.unirse add column if not exists comunidad text;
alter table public.unirse add column if not exists comments text;
alter table public.unirse add column if not exists hijos integer not null default 0;
alter table public.unirse add column if not exists birthday_event_id text;
alter table public.unirse add column if not exists ultimo_correo_cumpleanos timestamptz;

create index if not exists unirse_created_at_idx on public.unirse (created_at desc);
create index if not exists unirse_comunidad_idx on public.unirse (comunidad);
create index if not exists unirse_email_idx on public.unirse (lower(email));

-- Bloquea registros futuros si ya existe el mismo correo o teléfono. Se usa
-- un trigger (en lugar de un índice único) para conservar duplicados históricos.
create or replace function public.prevent_duplicate_unirse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(regexp_replace(trim(coalesce(new.email, '')), '\s+', '', 'g'));
  normalized_phone text := regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g');
begin
  if normalized_email <> '' then
    perform pg_advisory_xact_lock(hashtextextended('unirse-email:' || normalized_email, 0));
  end if;
  if normalized_phone <> '' then
    perform pg_advisory_xact_lock(hashtextextended('unirse-phone:' || normalized_phone, 0));
  end if;

  if exists (
    select 1 from public.unirse existing
    where (normalized_email <> '' and lower(regexp_replace(trim(coalesce(existing.email, '')), '\s+', '', 'g')) = normalized_email)
       or (normalized_phone <> '' and regexp_replace(coalesce(existing.telefono, ''), '\D', '', 'g') = normalized_phone)
  ) then
    raise exception using errcode = '23505', message = 'duplicate member email or phone';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_unirse_before_insert on public.unirse;
create trigger prevent_duplicate_unirse_before_insert
before insert on public.unirse
for each row execute function public.prevent_duplicate_unirse();

-- Mensajes del formulario de contacto.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  email text not null,
  mensaje text not null,
  destino text,
  source text not null default 'web'
);

alter table public.contact_messages add column if not exists created_at timestamptz not null default now();
alter table public.contact_messages add column if not exists nombre text;
alter table public.contact_messages add column if not exists email text;
alter table public.contact_messages add column if not exists mensaje text;
alter table public.contact_messages add column if not exists destino text;
alter table public.contact_messages add column if not exists source text not null default 'web';

create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at desc);

-- Eventos administrables desde la web.
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  icono text default '✦',
  titulo text not null,
  horario text not null,
  link text not null,
  orden integer not null default 1,
  activa boolean not null default true
);

alter table public.eventos add column if not exists created_at timestamptz not null default now();
alter table public.eventos add column if not exists icono text default '✦';
alter table public.eventos add column if not exists titulo text;
alter table public.eventos add column if not exists horario text;
alter table public.eventos add column if not exists link text;
alter table public.eventos add column if not exists orden integer not null default 1;
alter table public.eventos add column if not exists activa boolean not null default true;

create index if not exists eventos_activa_orden_idx on public.eventos (activa, orden);

-- Mujeres destacadas / invitadas.
create table if not exists public.destacadas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  foto_url text not null,
  nombre text not null,
  titulo text,
  orden integer not null default 1,
  activa boolean not null default true
);

alter table public.destacadas add column if not exists created_at timestamptz not null default now();
alter table public.destacadas add column if not exists foto_url text;
alter table public.destacadas add column if not exists nombre text;
alter table public.destacadas add column if not exists titulo text;
alter table public.destacadas add column if not exists orden integer not null default 1;
alter table public.destacadas add column if not exists activa boolean not null default true;

create index if not exists destacadas_activa_orden_idx on public.destacadas (activa, orden);

-- Galeria de fotos.
create table if not exists public.galeria (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  foto_url text not null,
  categoria text not null,
  texto text,
  orden integer not null default 1,
  activa boolean not null default true,
  portada boolean not null default false
);

alter table public.galeria add column if not exists created_at timestamptz not null default now();
alter table public.galeria add column if not exists foto_url text;
alter table public.galeria add column if not exists categoria text;
alter table public.galeria add column if not exists texto text;
alter table public.galeria add column if not exists orden integer not null default 1;
alter table public.galeria add column if not exists activa boolean not null default true;
alter table public.galeria add column if not exists portada boolean not null default false;

create index if not exists galeria_activa_orden_idx on public.galeria (activa, orden);
create index if not exists galeria_categoria_idx on public.galeria (categoria);

-- Videos de YouTube administrables desde la web.
create table if not exists public.youtube (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  video_id text not null,
  titulo text not null,
  subtitulo text,
  etiqueta text not null default 'Conferencia',
  orden integer not null default 1,
  activa boolean not null default true
);

alter table public.youtube add column if not exists created_at timestamptz not null default now();
alter table public.youtube add column if not exists video_id text;
alter table public.youtube add column if not exists titulo text;
alter table public.youtube add column if not exists subtitulo text;
alter table public.youtube add column if not exists etiqueta text not null default 'Conferencia';
alter table public.youtube add column if not exists orden integer not null default 1;
alter table public.youtube add column if not exists activa boolean not null default true;

create index if not exists youtube_activa_orden_idx on public.youtube (activa, orden);

-- Banner promocional flotante mostrado en el sitio público (fila única, id fijo = 1).
create table if not exists public.site_banner (
  id integer primary key default 1 check (id = 1),
  titulo text not null default '',
  mensaje text not null default '',
  activa boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_banner (id, titulo, mensaje, activa)
values (1, '', '', false)
on conflict (id) do nothing;

-- Artículos de la biblioteca de devocionales.
create table if not exists public.devocionales (
  id bigint generated by default as identity primary key,
  titulo text,
  slug text not null unique,
  resumen text,
  contenido text,
  introduccion_html text,
  contenido_html text,
  versiculo text,
  categorias text[] not null default '{}',
  autora text not null default 'Equipo Mujeres con Propósito',
  imagen_url text,
  publicado boolean not null default false,
  fecha_publicacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devocionales add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.devocionales add column if not exists introduccion_html text;
alter table public.devocionales add column if not exists contenido_html text;
alter table public.devocionales add column if not exists versiculo text;
alter table public.devocionales add column if not exists categorias text[] not null default '{}';
alter table public.devocionales add column if not exists compartidos integer not null default 0;
alter table public.devocionales alter column titulo drop not null;
alter table public.devocionales alter column contenido drop not null;
alter table public.devocionales
  add column if not exists estado text not null default 'borrador'
    check (estado in ('borrador','en_revision','cambios_solicitados')),
  add column if not exists pending_content jsonb,
  add column if not exists pending_fecha_publicacion timestamptz;

create index if not exists devocionales_publicados_fecha_idx
on public.devocionales (publicado, fecha_publicacion desc);

-- Historial de auditoría del flujo editorial (Editor -> Reviewer).
create table if not exists public.devocional_historial (
  id bigint generated by default as identity primary key,
  devocional_id bigint references public.devocionales(id) on delete set null,
  devocional_titulo text,
  devocional_slug text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  accion text not null check (accion in (
    'creado', 'editado', 'enviado_a_revision', 'cambios_solicitados',
    'retirado', 'aprobado_publicado', 'despublicado', 'eliminado'
  )),
  nota text,
  created_at timestamptz not null default now()
);

create index if not exists devocional_historial_devocional_idx
on public.devocional_historial (devocional_id, created_at desc);

create or replace function public.devocionales_guard_direct_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() or current_setting('app.devocional_guard_bypass', true) = 'on' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.titulo is not null or new.resumen is not null or new.contenido is not null
       or new.introduccion_html is not null or new.contenido_html is not null
       or new.versiculo is not null or new.imagen_url is not null
       or new.publicado is true or new.fecha_publicacion is not null
       or new.estado <> 'borrador' then
      raise exception 'Los artículos nuevos deben crearse mediante pending_content.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.resumen is distinct from old.resumen
     or new.contenido is distinct from old.contenido
     or new.introduccion_html is distinct from old.introduccion_html
     or new.contenido_html is distinct from old.contenido_html
     or new.versiculo is distinct from old.versiculo
     or new.categorias is distinct from old.categorias
     or new.autora is distinct from old.autora
     or new.imagen_url is distinct from old.imagen_url
     or new.publicado is distinct from old.publicado
     or new.fecha_publicacion is distinct from old.fecha_publicacion
     or new.estado is distinct from old.estado then
    raise exception 'No puedes modificar contenido publicado directamente; usa el flujo de revisión.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists devocionales_guard_direct_writes on public.devocionales;
create trigger devocionales_guard_direct_writes
before insert or update on public.devocionales
for each row execute function public.devocionales_guard_direct_writes();

create or replace function public.devocionales_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
    values (new.id, coalesce(new.titulo, new.pending_content->>'titulo'), new.slug, auth.uid(),
      (select email from public.user_roles where user_id = auth.uid()), 'creado');
    return new;
  end if;

  if current_setting('app.devocional_guard_bypass', true) = 'on' then
    return new;
  end if;

  if new.pending_content is distinct from old.pending_content
     or new.pending_fecha_publicacion is distinct from old.pending_fecha_publicacion then
    insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
    values (new.id, coalesce(new.titulo, new.pending_content->>'titulo'), new.slug, auth.uid(),
      (select email from public.user_roles where user_id = auth.uid()), 'editado');
  end if;
  return new;
end;
$$;

drop trigger if exists devocionales_log_activity on public.devocionales;
create trigger devocionales_log_activity
after insert or update on public.devocionales
for each row execute function public.devocionales_log_activity();

create or replace function public.devocionales_log_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (old.id, coalesce(old.titulo, old.pending_content->>'titulo'), old.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'eliminado');
  return old;
end;
$$;

drop trigger if exists devocionales_log_delete on public.devocionales;
create trigger devocionales_log_delete
before delete on public.devocionales
for each row execute function public.devocionales_log_delete();

create or replace function public.devocional_submit_for_review(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by <> auth.uid() or not public.has_permission('editor') then
    raise exception 'No tienes permiso para enviar este devocional a revisión.' using errcode = '42501';
  end if;
  if target.estado not in ('borrador', 'cambios_solicitados') then
    raise exception 'Este devocional ya está en revisión.';
  end if;
  if target.pending_content is null
     or coalesce(btrim(target.pending_content->>'titulo'), '') = ''
     or coalesce(btrim(target.pending_content->>'contenido'), '') = '' then
    raise exception 'Completa al menos el título y la reflexión antes de enviar a revisión.';
  end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'en_revision', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'enviado_a_revision');
end;
$$;

revoke all on function public.devocional_submit_for_review(bigint) from public;
grant execute on function public.devocional_submit_for_review(bigint) to authenticated;

create or replace function public.devocional_request_changes(p_id bigint, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.devocionales%rowtype;
  nota text := btrim(coalesce(p_nota, ''));
begin
  if nota = '' then raise exception 'Escribe una nota explicando los cambios solicitados.'; end if;
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by = auth.uid() or not public.has_permission('reviewer') then
    raise exception 'No tienes permiso para revisar este devocional.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'cambios_solicitados', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion, nota)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'cambios_solicitados', nota);
end;
$$;

revoke all on function public.devocional_request_changes(bigint, text) from public;
grant execute on function public.devocional_request_changes(bigint, text) to authenticated;

create or replace function public.devocional_approve_and_publish(p_id bigint, p_fecha timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.devocionales%rowtype;
  fecha timestamptz;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (public.is_super_admin() or (public.has_permission('reviewer') and target.created_by <> auth.uid())) then
    raise exception 'No tienes permiso para aprobar este devocional.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;
  if target.pending_content is null then raise exception 'No hay contenido pendiente para aprobar.'; end if;

  fecha := coalesce(p_fecha, target.pending_fecha_publicacion, now());

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set
    titulo = target.pending_content->>'titulo',
    resumen = target.pending_content->>'resumen',
    contenido = target.pending_content->>'contenido',
    contenido_html = target.pending_content->>'contenido_html',
    introduccion_html = target.pending_content->>'introduccion_html',
    versiculo = target.pending_content->>'versiculo',
    categorias = coalesce((select array_agg(value) from jsonb_array_elements_text(target.pending_content->'categorias')), '{}'),
    autora = coalesce(nullif(target.pending_content->>'autora', ''), target.autora),
    imagen_url = target.pending_content->>'imagen_url',
    publicado = true,
    fecha_publicacion = fecha,
    pending_content = null,
    pending_fecha_publicacion = null,
    estado = 'borrador',
    updated_at = now()
  where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, target.pending_content->>'titulo', target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'aprobado_publicado');
end;
$$;

revoke all on function public.devocional_approve_and_publish(bigint, timestamptz) from public;
grant execute on function public.devocional_approve_and_publish(bigint, timestamptz) to authenticated;

create or replace function public.devocional_withdraw(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (
    public.is_super_admin()
    or (public.has_permission('editor') and target.created_by = auth.uid())
    or (public.has_permission('reviewer') and target.created_by <> auth.uid())
  ) then
    raise exception 'No tienes permiso para retirar este devocional de revisión.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'borrador', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'retirado');
end;
$$;

revoke all on function public.devocional_withdraw(bigint) from public;
grant execute on function public.devocional_withdraw(bigint) to authenticated;

create or replace function public.devocional_unpublish(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not public.is_super_admin() then
    raise exception 'Solo el Super Admin puede retirar un devocional publicado.' using errcode = '42501';
  end if;
  if not target.publicado then raise exception 'Este devocional no está publicado.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set publicado = false, fecha_publicacion = null, updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, target.titulo, target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'despublicado');
end;
$$;

revoke all on function public.devocional_unpublish(bigint) from public;
grant execute on function public.devocional_unpublish(bigint) to authenticated;

-- Storage usado por el admin web:
-- Bucket esperado: mcp930-images
-- Carpetas usadas por el codigo: eventos/, destacadas/ y galeria/

-- Policies con Supabase Auth:
-- - El sitio publico puede leer eventos/destacadas/galeria.
-- - El sitio publico puede insertar formularios unirse/contacto.
-- - Admin/Dashboard requieren usuario autenticado para leer registros y escribir contenido.

alter table public.eventos enable row level security;
alter table public.destacadas enable row level security;
alter table public.galeria enable row level security;
alter table public.youtube enable row level security;
alter table public.devocionales enable row level security;
alter table public.devocional_historial enable row level security;
alter table public.unirse enable row level security;
alter table public.contact_messages enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "super admin read devocional historial" on public.devocional_historial;
create policy "super admin read devocional historial"
on public.devocional_historial for select to authenticated
using (public.is_super_admin());

drop policy if exists "reviewers read devocional historial" on public.devocional_historial;
create policy "reviewers read devocional historial"
on public.devocional_historial for select to authenticated
using (public.has_permission('reviewer'));

drop policy if exists "authors read own devocional historial" on public.devocional_historial;
create policy "authors read own devocional historial"
on public.devocional_historial for select to authenticated
using (
  public.has_permission('editor')
  and devocional_id is not null
  and exists (
    select 1 from public.devocionales d
    where d.id = devocional_historial.devocional_id and d.created_by = auth.uid()
  )
);

drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "crud manages roles" on public.user_roles;
drop policy if exists "super admin manages roles" on public.user_roles;
create policy "super admin manages roles" on public.user_roles for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "public read eventos" on public.eventos;
create policy "public read eventos"
on public.eventos for select
to anon, authenticated
using (true);

drop policy if exists "public write eventos" on public.eventos;
drop policy if exists "authenticated write eventos" on public.eventos;
drop policy if exists "crud write eventos" on public.eventos;
create policy "super admin write eventos"
on public.eventos for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "public read destacadas" on public.destacadas;
create policy "public read destacadas"
on public.destacadas for select
to anon, authenticated
using (true);

drop policy if exists "public write destacadas" on public.destacadas;
drop policy if exists "authenticated write destacadas" on public.destacadas;
drop policy if exists "crud write destacadas" on public.destacadas;
create policy "super admin write destacadas"
on public.destacadas for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "public read galeria" on public.galeria;
create policy "public read galeria"
on public.galeria for select
to anon, authenticated
using (true);

drop policy if exists "public write galeria" on public.galeria;
drop policy if exists "authenticated write galeria" on public.galeria;
drop policy if exists "crud write galeria" on public.galeria;
create policy "super admin write galeria"
on public.galeria for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "public read youtube" on public.youtube;
create policy "public read youtube"
on public.youtube for select
to anon, authenticated
using (true);

drop policy if exists "authenticated write youtube" on public.youtube;
drop policy if exists "crud write youtube" on public.youtube;
create policy "super admin write youtube"
on public.youtube for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

alter table public.site_banner enable row level security;

drop policy if exists "public read site_banner" on public.site_banner;
create policy "public read site_banner"
on public.site_banner for select
to anon, authenticated
using (true);

drop policy if exists "super admin write site_banner" on public.site_banner;
create policy "super admin write site_banner"
on public.site_banner for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "public read published devocionales" on public.devocionales;
create policy "public read published devocionales"
on public.devocionales for select
to anon, authenticated
using (publicado = true and fecha_publicacion is not null and fecha_publicacion <= now());

drop policy if exists "authenticated write devocionales" on public.devocionales;
create policy "super admin write devocionales"
on public.devocionales for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "editors read own devocionales" on public.devocionales;
create policy "editors read own devocionales"
on public.devocionales for select to authenticated
using (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "editors insert own devocionales" on public.devocionales;
create policy "editors insert own devocionales"
on public.devocionales for insert to authenticated
with check (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "editors update own devocionales" on public.devocionales;
create policy "editors update own devocionales"
on public.devocionales for update to authenticated
using (public.has_permission('editor') and created_by = auth.uid())
with check (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "reviewers update queue devocionales" on public.devocionales;
create policy "reviewers update queue devocionales"
on public.devocionales for update to authenticated
using (
  public.has_permission('reviewer') and created_by <> auth.uid()
  and (estado in ('en_revision','cambios_solicitados') or publicado = true)
)
with check (public.has_permission('reviewer') and created_by <> auth.uid());

drop policy if exists "reviewers read queue devocionales" on public.devocionales;
create policy "reviewers read queue devocionales"
on public.devocionales for select to authenticated
using (
  public.has_permission('reviewer') and created_by <> auth.uid()
  and (estado in ('en_revision','cambios_solicitados') or publicado = true)
);

drop policy if exists "editors delete own devocionales" on public.devocionales;
create policy "editors delete own devocionales"
on public.devocionales for delete to authenticated
using (public.has_permission('editor') and created_by = auth.uid() and publicado = false);

drop policy if exists "authenticated read unirse" on public.unirse;
drop policy if exists "roles read unirse" on public.unirse;
create policy "permissions read unirse"
on public.unirse for select
to authenticated
using (public.is_super_admin() or public.has_permission('read_export') or public.has_permission('read_only'));

drop policy if exists "crud update unirse" on public.unirse;
create policy "super admin update unirse"
on public.unirse for update
to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "crud delete unirse" on public.unirse;
create policy "super admin delete unirse"
on public.unirse for delete
to authenticated
using (public.is_super_admin());

-- Los inserts públicos ya NO se permiten directo por "anon": los formularios
-- "Únete" y "Contacto" pasan por las Edge Functions submit-join / submit-contact,
-- que verifican Cloudflare Turnstile y usan la service role key para insertar.
drop policy if exists "public insert unirse" on public.unirse;
drop policy if exists "public insert contact_messages" on public.contact_messages;

insert into storage.buckets (id, name, public)
values ('mcp930-images', 'mcp930-images', true)
on conflict (id) do update
set public = true;

drop policy if exists "public read mcp930 images" on storage.objects;
create policy "public read mcp930 images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'mcp930-images');

drop policy if exists "public upload mcp930 images" on storage.objects;
drop policy if exists "authenticated upload mcp930 images" on storage.objects;
drop policy if exists "crud upload mcp930 images" on storage.objects;
create policy "super admin upload mcp930 images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'mcp930-images' and public.is_super_admin());

drop policy if exists "editors upload devotional images" on storage.objects;
drop policy if exists "editorial upload devotional images" on storage.objects;
create policy "editorial upload devotional images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mcp930-images'
  and (public.has_permission('editor') or public.has_permission('reviewer'))
  and (storage.foldername(name))[1] = 'devocionales'
);

drop policy if exists "authenticated update mcp930 images" on storage.objects;
drop policy if exists "crud update mcp930 images" on storage.objects;
create policy "super admin update mcp930 images"
on storage.objects for update
to authenticated
using (bucket_id = 'mcp930-images' and public.is_super_admin())
with check (bucket_id = 'mcp930-images' and public.is_super_admin());

drop policy if exists "authenticated delete mcp930 images" on storage.objects;
drop policy if exists "crud delete mcp930 images" on storage.objects;
create policy "super admin delete mcp930 images"
on storage.objects for delete
to authenticated
using (bucket_id = 'mcp930-images' and public.is_super_admin());
