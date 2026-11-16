-- View-only roles: a role flagged view_only (the built-in Viewer) can only hold "view"
-- permissions, and people assigned to it can never gain write permissions, not even
-- through individual exceptions. Enforced in the database, not only in the app.

alter table public.admin_roles add column if not exists view_only boolean not null default false;
update public.admin_roles set view_only = true where lower(name) = 'viewer';

-- Clean any write permission that a view-only role or its members may already have.
delete from public.admin_role_permissions p
  using public.admin_roles r, public.admin_permission_catalog c
  where p.role_id = r.id and r.view_only and c.permission_key = p.permission_key and c.action_key <> 'view';
delete from public.admin_user_permission_overrides o
  using public.admin_role_assignments a, public.admin_roles r, public.admin_permission_catalog c
  where o.user_id = a.user_id and a.role_id = r.id and r.view_only and o.allowed
    and c.permission_key = o.permission_key and c.action_key <> 'view';

-- True when the user is assigned to a view-only role.
create or replace function public.admin_user_is_view_only(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_role_assignments a join public.admin_roles r on r.id = a.role_id
                 where a.user_id = p_user_id and r.view_only);
$$;
revoke all on function public.admin_user_is_view_only(uuid) from public, anon, authenticated;

-- Effective permission (end-user requests): view-only members never get a non-view action.
create or replace function public.has_admin_module_permission(p_module text, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  permission_name text := p_module || '.' || p_action;
  assigned_role uuid;
  overridden boolean;
  legacy_permissions text[];
begin
  if uid is null or not exists (select 1 from public.admin_permission_catalog where permission_key = permission_name) then return false; end if;
  if public.is_super_admin() then return true; end if;
  if not exists (select 1 from public.user_roles where user_id = uid and not is_revoked) then return false; end if;
  if p_action <> 'view' and public.admin_user_is_view_only(uid) then return false; end if;

  select allowed into overridden from public.admin_user_permission_overrides
    where user_id = uid and permission_key = permission_name;
  if found then return overridden; end if;

  select role_id into assigned_role from public.admin_role_assignments where user_id = uid;
  if found then
    return exists (select 1 from public.admin_role_permissions where role_id = assigned_role and permission_key = permission_name);
  end if;

  select permissions into legacy_permissions from public.user_roles where user_id = uid;
  if p_module = 'devotionals' and 'editor' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','create','edit','delete') then return true; end if;
  if p_module = 'devotionals' and 'reviewer' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','edit','publish') then return true; end if;
  if p_module = 'dashboard' and coalesce(legacy_permissions, '{}') && array['read_only','read_export'] then return p_action = 'view'; end if;
  return false;
end;
$$;
revoke all on function public.has_admin_module_permission(text,text) from public, anon;
grant execute on function public.has_admin_module_permission(text,text) to authenticated;

-- Same rule for server-side checks (send-broadcast).
create or replace function public.admin_user_has_permission(p_user_id uuid, p_module text, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare allowed_value boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.admin_permission_catalog where permission_key = p_module || '.' || p_action) then return false; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and not is_revoked) then return false; end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and is_super_admin and not is_revoked) then return true; end if;
  if p_action <> 'view' and public.admin_user_is_view_only(p_user_id) then return false; end if;
  select allowed into allowed_value from public.admin_user_permission_overrides where user_id = p_user_id and permission_key = p_module || '.' || p_action;
  if found then return allowed_value; end if;
  if exists (select 1 from public.admin_role_assignments a join public.admin_role_permissions p on p.role_id = a.role_id where a.user_id = p_user_id and p.permission_key = p_module || '.' || p_action) then return true; end if;
  if exists (select 1 from public.admin_role_assignments where user_id = p_user_id) then return false; end if;
  return coalesce(
    (p_module = 'devotionals' and p_action in ('view','create','edit','delete') and 'editor' = any(coalesce((select permissions from public.user_roles where user_id=p_user_id), '{}')))
    or (p_module = 'devotionals' and p_action in ('view','edit','publish') and 'reviewer' = any(coalesce((select permissions from public.user_roles where user_id=p_user_id), '{}')))
    or (p_module = 'dashboard' and p_action = 'view' and coalesce((select permissions from public.user_roles where user_id=p_user_id), '{}') && array['read_only','read_export']), false);
end;
$$;
revoke all on function public.admin_user_has_permission(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_user_has_permission(uuid,text,text) to service_role;

-- Saving role permissions: a view-only role only accepts "view" permissions.
create or replace function public.admin_save_role_permissions(p_role_id uuid, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede administrar roles.' using errcode='42501'; end if;
  if not exists(select 1 from public.admin_roles where id=p_role_id) then raise exception 'No se encontró el rol.'; end if;
  if exists(select 1 from unnest(coalesce(p_permissions,'{}')) x where not exists(select 1 from public.admin_permission_catalog c where c.permission_key=x)) then raise exception 'La lista contiene permisos desconocidos.'; end if;
  if exists(select 1 from public.admin_roles where id=p_role_id and view_only)
     and exists(select 1 from unnest(coalesce(p_permissions,'{}')) x join public.admin_permission_catalog c on c.permission_key=x where c.action_key<>'view') then
    raise exception 'Este rol es de solo lectura: solo admite permisos de visualizar.' using errcode='42501';
  end if;
  delete from public.admin_role_permissions where role_id=p_role_id;
  insert into public.admin_role_permissions(role_id,permission_key) select p_role_id, distinct_key from (select distinct unnest(coalesce(p_permissions,'{}')) distinct_key) x;
  update public.admin_roles set updated_at=now() where id=p_role_id;
end;
$$;

-- Saving exceptions: members of a view-only role cannot be granted non-view permissions.
create or replace function public.admin_save_user_overrides(p_user_id uuid, p_overrides jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede cambiar excepciones.' using errcode='42501'; end if;
  if p_user_id=auth.uid() then raise exception 'No puedes cambiar tus propios permisos.' using errcode='42501'; end if;
  if exists(select 1 from public.user_roles where user_id=p_user_id and is_super_admin and not is_revoked) then raise exception 'Las cuentas Super Admin conservan sus permisos protegidos.' using errcode='42501'; end if;
  if not exists(select 1 from public.admin_role_assignments where user_id=p_user_id) then raise exception 'Asigna un rol antes de configurar excepciones.'; end if;
  if jsonb_typeof(coalesce(p_overrides,'{}'::jsonb)) <> 'object' then raise exception 'Formato de excepciones inválido.'; end if;
  delete from public.admin_user_permission_overrides where user_id=p_user_id;
  for item in select key,value from jsonb_each(coalesce(p_overrides,'{}'::jsonb)) loop
    if not exists(select 1 from public.admin_permission_catalog where permission_key=item.key) or jsonb_typeof(item.value)<>'boolean' then raise exception 'Excepción de permiso inválida.'; end if;
    if (item.value)::text::boolean and public.admin_user_is_view_only(p_user_id)
       and exists(select 1 from public.admin_permission_catalog where permission_key=item.key and action_key<>'view') then
      raise exception 'Esta persona tiene un rol de solo lectura: no se le pueden permitir acciones de modificar.' using errcode='42501';
    end if;
    insert into public.admin_user_permission_overrides(user_id,permission_key,allowed,updated_by)
      values(p_user_id,item.key,(item.value)::text::boolean,auth.uid());
  end loop;
end;
$$;

do $$ declare fn regprocedure; begin
  foreach fn in array array['public.admin_save_role_permissions(uuid,text[])'::regprocedure,'public.admin_save_user_overrides(uuid,jsonb)'::regprocedure] loop
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end $$;
