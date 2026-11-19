-- Confetti on a special date (e.g. the first anniversary of MCP930 in Europe).
-- One row, like site_banner. The day is evaluated in Europe/Luxembourg so
-- everyone celebrates on the same calendar day.
-- Rollback: supabase/rollbacks/20261119110000_site_confetti.down.sql
create table if not exists public.site_confetti (
  id integer primary key default 1 check (id = 1),
  activa boolean not null default false,
  fecha date,
  mensaje text not null default '' check (char_length(mensaje) <= 90),
  updated_at timestamptz not null default now(),
  constraint site_confetti_fecha_required check (not activa or fecha is not null)
);
insert into public.site_confetti (id) values (1) on conflict (id) do nothing;

alter table public.site_confetti enable row level security;
revoke all on public.site_confetti from anon, authenticated;
grant select on public.site_confetti to anon, authenticated;
grant update (activa, fecha, mensaje, updated_at) on public.site_confetti to authenticated;

drop policy if exists "public read site confetti" on public.site_confetti;
create policy "public read site confetti" on public.site_confetti for select to anon, authenticated using (true);
-- Same rules as the banner: edit needs content.edit, switching it on/off needs content.publish.
drop policy if exists "roles edit site confetti" on public.site_confetti;
create policy "roles edit site confetti" on public.site_confetti for update to authenticated
  using (public.has_admin_module_permission('content','edit'))
  with check (public.has_admin_module_permission('content','edit'));
drop trigger if exists admin_guard_content_activation_confetti on public.site_confetti;
create trigger admin_guard_content_activation_confetti before update on public.site_confetti
  for each row execute function public.admin_guard_content_activation();
