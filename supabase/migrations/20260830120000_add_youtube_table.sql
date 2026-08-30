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

create index if not exists youtube_activa_orden_idx on public.youtube (activa, orden);

alter table public.youtube enable row level security;

drop policy if exists "public read youtube" on public.youtube;
create policy "public read youtube"
on public.youtube for select
to anon, authenticated
using (true);

drop policy if exists "authenticated write youtube" on public.youtube;
create policy "authenticated write youtube"
on public.youtube for all
to authenticated
using (true)
with check (true);
