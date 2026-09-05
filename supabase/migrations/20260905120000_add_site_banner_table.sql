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
