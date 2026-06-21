-- Supabase / PostgreSQL schema for Mujeres con Proposito
-- Ejecuta este script en el SQL Editor de Supabase si necesitas recrear o
-- completar columnas. Las tablas coinciden con assets/js/main.js.

create extension if not exists "pgcrypto";

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
create unique index if not exists unirse_email_unique on public.unirse (lower(email));

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
  activa boolean not null default true
);

alter table public.galeria add column if not exists created_at timestamptz not null default now();
alter table public.galeria add column if not exists foto_url text;
alter table public.galeria add column if not exists categoria text;
alter table public.galeria add column if not exists texto text;
alter table public.galeria add column if not exists orden integer not null default 1;
alter table public.galeria add column if not exists activa boolean not null default true;

create index if not exists galeria_activa_orden_idx on public.galeria (activa, orden);
create index if not exists galeria_categoria_idx on public.galeria (categoria);

-- Storage usado por el admin web:
-- Bucket esperado: mcp930-images
-- Carpetas usadas por el codigo: destacadas/ y galeria/

-- Policies con Supabase Auth:
-- - El sitio publico puede leer eventos/destacadas/galeria.
-- - El sitio publico puede insertar formularios unirse/contacto.
-- - Admin/Dashboard requieren usuario autenticado para leer registros y escribir contenido.

alter table public.eventos enable row level security;
alter table public.destacadas enable row level security;
alter table public.galeria enable row level security;
alter table public.unirse enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "public read eventos" on public.eventos;
create policy "public read eventos"
on public.eventos for select
to anon, authenticated
using (true);

drop policy if exists "public write eventos" on public.eventos;
drop policy if exists "authenticated write eventos" on public.eventos;
create policy "authenticated write eventos"
on public.eventos for all
to authenticated
using (true)
with check (true);

drop policy if exists "public read destacadas" on public.destacadas;
create policy "public read destacadas"
on public.destacadas for select
to anon, authenticated
using (true);

drop policy if exists "public write destacadas" on public.destacadas;
drop policy if exists "authenticated write destacadas" on public.destacadas;
create policy "authenticated write destacadas"
on public.destacadas for all
to authenticated
using (true)
with check (true);

drop policy if exists "public read galeria" on public.galeria;
create policy "public read galeria"
on public.galeria for select
to anon, authenticated
using (true);

drop policy if exists "public write galeria" on public.galeria;
drop policy if exists "authenticated write galeria" on public.galeria;
create policy "authenticated write galeria"
on public.galeria for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated read unirse" on public.unirse;
create policy "authenticated read unirse"
on public.unirse for select
to authenticated
using (true);

drop policy if exists "public insert unirse" on public.unirse;
create policy "public insert unirse"
on public.unirse for insert
to anon
with check (true);

drop policy if exists "public insert contact_messages" on public.contact_messages;
create policy "public insert contact_messages"
on public.contact_messages for insert
to anon
with check (true);

drop policy if exists "public read mcp930 images" on storage.objects;
create policy "public read mcp930 images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'mcp930-images');

drop policy if exists "public upload mcp930 images" on storage.objects;
drop policy if exists "authenticated upload mcp930 images" on storage.objects;
create policy "authenticated upload mcp930 images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'mcp930-images');
