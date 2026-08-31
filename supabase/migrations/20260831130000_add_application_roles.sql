-- Roles de acceso para el dashboard y el administrador.
-- Las cuentas existentes conservan CRUD. Las nuevas empiezan como read_only.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'read_only'
    check (role in ('crud', 'read_export', 'read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_roles (user_id, email, role)
select id, lower(email), 'crud' from auth.users
on conflict (user_id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()),
    'read_only'
  );
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.assign_default_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, email, role)
  values (new.id, lower(new.email), 'read_only')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists assign_default_user_role_after_signup on auth.users;
create trigger assign_default_user_role_after_signup
after insert on auth.users
for each row execute function public.assign_default_user_role();

alter table public.user_roles enable row level security;

drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role"
on public.user_roles for select
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'crud');

drop policy if exists "crud manages roles" on public.user_roles;
create policy "crud manages roles"
on public.user_roles for all
to authenticated
using (public.current_user_role() = 'crud')
with check (public.current_user_role() = 'crud');

-- Solo CRUD puede modificar el contenido administrable.
drop policy if exists "authenticated write eventos" on public.eventos;
create policy "crud write eventos" on public.eventos for all to authenticated
using (public.current_user_role() = 'crud') with check (public.current_user_role() = 'crud');

drop policy if exists "authenticated write destacadas" on public.destacadas;
create policy "crud write destacadas" on public.destacadas for all to authenticated
using (public.current_user_role() = 'crud') with check (public.current_user_role() = 'crud');

drop policy if exists "authenticated write galeria" on public.galeria;
create policy "crud write galeria" on public.galeria for all to authenticated
using (public.current_user_role() = 'crud') with check (public.current_user_role() = 'crud');

drop policy if exists "authenticated write youtube" on public.youtube;
create policy "crud write youtube" on public.youtube for all to authenticated
using (public.current_user_role() = 'crud') with check (public.current_user_role() = 'crud');

drop policy if exists "authenticated read unirse" on public.unirse;
create policy "roles read unirse" on public.unirse for select to authenticated
using (public.current_user_role() in ('crud', 'read_export', 'read_only'));

drop policy if exists "crud update unirse" on public.unirse;
create policy "crud update unirse" on public.unirse for update to authenticated
using (public.current_user_role() = 'crud') with check (public.current_user_role() = 'crud');

drop policy if exists "crud delete unirse" on public.unirse;
create policy "crud delete unirse" on public.unirse for delete to authenticated
using (public.current_user_role() = 'crud');

drop policy if exists "authenticated upload mcp930 images" on storage.objects;
create policy "crud upload mcp930 images" on storage.objects for insert to authenticated
with check (bucket_id = 'mcp930-images' and public.current_user_role() = 'crud');

drop policy if exists "authenticated update mcp930 images" on storage.objects;
create policy "crud update mcp930 images" on storage.objects for update to authenticated
using (bucket_id = 'mcp930-images' and public.current_user_role() = 'crud')
with check (bucket_id = 'mcp930-images' and public.current_user_role() = 'crud');

drop policy if exists "authenticated delete mcp930 images" on storage.objects;
create policy "crud delete mcp930 images" on storage.objects for delete to authenticated
using (bucket_id = 'mcp930-images' and public.current_user_role() = 'crud');
