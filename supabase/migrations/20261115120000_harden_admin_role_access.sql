-- Deny access by default, enforce revocation for Super Admin, and redact
-- sensitive member fields from dashboard-only accounts.

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select is_super_admin and not is_revoked
    from public.user_roles
    where user_id = auth.uid()
  ), false);
$$;

create or replace function public.has_permission(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select not is_revoked and (is_super_admin or p = any(permissions))
    from public.user_roles
    where user_id = auth.uid()
  ), false);
$$;

alter table public.user_roles
  alter column permissions set default '{}';

create or replace function public.assign_default_user_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, email, is_super_admin, permissions, is_revoked)
  values (new.id, lower(new.email), false, '{}', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

drop policy if exists "authenticated read unirse" on public.unirse;
drop policy if exists "roles read unirse" on public.unirse;
drop policy if exists "permissions read unirse" on public.unirse;
create policy "permissions read unirse"
on public.unirse for select to authenticated
using (public.is_super_admin() or public.has_permission('read_export'));

create or replace function public.admin_dashboard_members()
returns setof public.unirse
language plpgsql stable security definer set search_path = ''
as $$
declare
  can_read_private boolean := public.is_super_admin() or public.has_permission('read_export');
begin
  if not (can_read_private or public.has_permission('read_only')) then
    raise exception 'No tienes permiso para ver el dashboard.' using errcode = '42501';
  end if;

  return query
  select (jsonb_populate_record(
    null::public.unirse,
    case when can_read_private then to_jsonb(member)
      else to_jsonb(member) - array[
        'email', 'telefono', 'fecha_nacimiento', 'pais_nacimiento',
        'estatus_matrimonial', 'hijos', 'comments', 'birthday_event_id',
        'ultimo_correo_cumpleanos'
      ]::text[]
    end
  )).*
  from public.unirse as member
  order by member.created_at desc;
end;
$$;

revoke all on function public.admin_dashboard_members() from public;
grant execute on function public.admin_dashboard_members() to authenticated;
