-- Rollback for 20261116130000_view_only_roles.sql: restores the previous function versions
-- (from 20261116120000) and removes the view_only flag.
begin;

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
  -- Audit fix: only authorized, non-revoked team accounts (user_roles) can hold module permissions.
  if not exists (select 1 from public.user_roles where user_id = uid and not is_revoked) then return false; end if;

  select allowed into overridden from public.admin_user_permission_overrides
    where user_id = uid and permission_key = permission_name;
  if found then return overridden; end if;

  select role_id into assigned_role from public.admin_role_assignments where user_id = uid;
  if found then
    return exists (select 1 from public.admin_role_permissions where role_id = assigned_role and permission_key = permission_name);
  end if;

  -- Backward-compatible access for established legacy groups; explicit custom-role
  -- assignment takes precedence, so old broad permissions cannot bypass exceptions.
  select permissions into legacy_permissions from public.user_roles where user_id = uid;
  if p_module = 'devotionals' and 'editor' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','create','edit','delete') then return true; end if;
  if p_module = 'devotionals' and 'reviewer' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','edit','publish') then return true; end if;
  if p_module = 'dashboard' and coalesce(legacy_permissions, '{}') && array['read_only','read_export'] then return p_action = 'view'; end if;
  return false;
end;
$$;

create or replace function public.admin_user_has_permission(p_user_id uuid, p_module text, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare allowed_value boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.admin_permission_catalog where permission_key = p_module || '.' || p_action) then return false; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and not is_revoked) then return false; end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and is_super_admin and not is_revoked) then return true; end if;
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

create or replace function public.admin_save_role_permissions(p_role_id uuid, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede administrar roles.' using errcode='42501'; end if;
  if not exists(select 1 from public.admin_roles where id=p_role_id) then raise exception 'No se encontró el rol.'; end if;
  if exists(select 1 from unnest(coalesce(p_permissions,'{}')) x where not exists(select 1 from public.admin_permission_catalog c where c.permission_key=x)) then raise exception 'La lista contiene permisos desconocidos.'; end if;
  delete from public.admin_role_permissions where role_id=p_role_id;
  insert into public.admin_role_permissions(role_id,permission_key) select p_role_id, distinct_key from (select distinct unnest(coalesce(p_permissions,'{}')) distinct_key) x;
  update public.admin_roles set updated_at=now() where id=p_role_id;
end;
$$;

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
    insert into public.admin_user_permission_overrides(user_id,permission_key,allowed,updated_by)
      values(p_user_id,item.key,(item.value)::text::boolean,auth.uid());
  end loop;
end;
$$;

revoke all on function public.has_admin_module_permission(text,text) from public, anon;
grant execute on function public.has_admin_module_permission(text,text) to authenticated;
revoke all on function public.admin_user_has_permission(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_user_has_permission(uuid,text,text) to service_role;
drop function if exists public.admin_user_is_view_only(uuid);
alter table public.admin_roles drop column if exists view_only;

commit;
