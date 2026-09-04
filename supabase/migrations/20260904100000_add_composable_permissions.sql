-- Reemplaza el rol único (role text) por permisos componibles.
-- Permite que una cuenta combine 'editor' y 'read_export' libremente,
-- mientras Super Admin sigue siendo un flag exclusivo (implica todo).

alter table public.user_roles
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists permissions text[] not null default '{read_only}',
  add column if not exists is_revoked boolean not null default false;

-- Backfill desde la columna role existente.
update public.user_roles set is_super_admin = true where role = 'crud';
update public.user_roles set permissions = '{read_only,editor}' where role = 'editor';
update public.user_roles set permissions = '{read_only,read_export}' where role = 'read_export';
update public.user_roles set permissions = '{read_only}' where role = 'read_only';
update public.user_roles set is_revoked = true where role = 'revoked';
-- revoked conserva los permisos que tenía; is_revoked los anula vía has_permission().

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles drop column if exists role;

-- Funciones de permisos, reemplazan a current_user_role().
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_super_admin from public.user_roles where user_id = auth.uid()), false);
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.has_permission(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select is_super_admin or (not is_revoked and p = any(permissions))
     from public.user_roles where user_id = auth.uid()),
    p = 'read_only'
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Alta de usuario: ya no escribe role.
create or replace function public.assign_default_user_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, email, is_super_admin, permissions, is_revoked)
  values (new.id, lower(new.email), false, '{read_only}', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- user_roles RLS
drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "crud manages roles" on public.user_roles;
drop policy if exists "super admin manages roles" on public.user_roles;
create policy "super admin manages roles" on public.user_roles for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

-- eventos / destacadas / galeria / youtube: escritura total, solo Super Admin.
drop policy if exists "crud write eventos" on public.eventos;
drop policy if exists "authenticated write eventos" on public.eventos;
create policy "super admin write eventos" on public.eventos for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "crud write destacadas" on public.destacadas;
drop policy if exists "authenticated write destacadas" on public.destacadas;
create policy "super admin write destacadas" on public.destacadas for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "crud write galeria" on public.galeria;
drop policy if exists "authenticated write galeria" on public.galeria;
create policy "super admin write galeria" on public.galeria for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "crud write youtube" on public.youtube;
drop policy if exists "authenticated write youtube" on public.youtube;
create policy "super admin write youtube" on public.youtube for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

-- devocionales: escritura total (Super Admin) + editor limitado a sus propias filas.
drop policy if exists "authenticated write devocionales" on public.devocionales;
create policy "super admin write devocionales" on public.devocionales for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "editors read own devocionales" on public.devocionales;
create policy "editors read own devocionales" on public.devocionales for select to authenticated
using (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "editors insert own devocionales" on public.devocionales;
create policy "editors insert own devocionales" on public.devocionales for insert to authenticated
with check (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "editors update own devocionales" on public.devocionales;
create policy "editors update own devocionales" on public.devocionales for update to authenticated
using (public.has_permission('editor') and created_by = auth.uid())
with check (public.has_permission('editor') and created_by = auth.uid());

drop policy if exists "editors delete own devocionales" on public.devocionales;
create policy "editors delete own devocionales" on public.devocionales for delete to authenticated
using (public.has_permission('editor') and created_by = auth.uid());

-- unirse
drop policy if exists "roles read unirse" on public.unirse;
drop policy if exists "authenticated read unirse" on public.unirse;
create policy "permissions read unirse" on public.unirse for select to authenticated
using (public.is_super_admin() or public.has_permission('read_export') or public.has_permission('read_only'));

drop policy if exists "crud update unirse" on public.unirse;
create policy "super admin update unirse" on public.unirse for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "crud delete unirse" on public.unirse;
create policy "super admin delete unirse" on public.unirse for delete to authenticated
using (public.is_super_admin());

-- storage.objects
drop policy if exists "crud upload mcp930 images" on storage.objects;
drop policy if exists "authenticated upload mcp930 images" on storage.objects;
create policy "super admin upload mcp930 images" on storage.objects for insert to authenticated
with check (bucket_id = 'mcp930-images' and public.is_super_admin());

drop policy if exists "crud update mcp930 images" on storage.objects;
drop policy if exists "authenticated update mcp930 images" on storage.objects;
create policy "super admin update mcp930 images" on storage.objects for update to authenticated
using (bucket_id = 'mcp930-images' and public.is_super_admin())
with check (bucket_id = 'mcp930-images' and public.is_super_admin());

drop policy if exists "crud delete mcp930 images" on storage.objects;
drop policy if exists "authenticated delete mcp930 images" on storage.objects;
create policy "super admin delete mcp930 images" on storage.objects for delete to authenticated
using (bucket_id = 'mcp930-images' and public.is_super_admin());

drop policy if exists "editors upload devotional images" on storage.objects;
create policy "editors upload devotional images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'mcp930-images'
  and public.has_permission('editor')
  and (storage.foldername(name))[1] = 'devocionales'
);

-- Todas las políticas ya migraron a is_super_admin()/has_permission(); ahora sí se puede quitar.
drop function if exists public.current_user_role();
