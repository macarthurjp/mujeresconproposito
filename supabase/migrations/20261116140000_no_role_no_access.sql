-- Without an assigned role there is no module access: the automatic "read_only"
-- (Vista simple) no longer grants the Dashboard. Super Admin and explicit legacy
-- grants (read_export, editor, reviewer) are unchanged.
--
-- The App Store review account keeps its read-only Dashboard through a dedicated,
-- view-only role, so the app under review behaves exactly as before.

insert into public.admin_roles (name, description, view_only)
values ('Revisión App Store', 'Cuenta de revisión de Apple: solo ver el Dashboard.', true)
on conflict (lower(name)) do update set view_only = true;

insert into public.admin_role_permissions (role_id, permission_key)
select id, 'dashboard.view' from public.admin_roles where lower(name) = lower('Revisión App Store')
on conflict do nothing;

insert into public.admin_role_assignments (user_id, role_id)
select u.user_id, r.id
from public.user_roles u, public.admin_roles r
where lower(u.email) = 'appreview@matmaxconsulting.com' and not u.is_revoked
  and lower(r.name) = lower('Revisión App Store')
on conflict (user_id) do nothing;

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

  -- No role: only explicit legacy grants. The automatic read_only gives nothing.
  select permissions into legacy_permissions from public.user_roles where user_id = uid;
  if p_module = 'devotionals' and 'editor' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','create','edit','delete') then return true; end if;
  if p_module = 'devotionals' and 'reviewer' = any(coalesce(legacy_permissions, '{}'))
     and p_action in ('view','edit','publish') then return true; end if;
  if p_module = 'dashboard' and p_action = 'view' and 'read_export' = any(coalesce(legacy_permissions, '{}')) then return true; end if;
  return false;
end;
$$;
revoke all on function public.has_admin_module_permission(text,text) from public, anon;
grant execute on function public.has_admin_module_permission(text,text) to authenticated;

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
    or (p_module = 'dashboard' and p_action = 'view' and 'read_export' = any(coalesce((select permissions from public.user_roles where user_id=p_user_id), '{}'))), false);
end;
$$;
revoke all on function public.admin_user_has_permission(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_user_has_permission(uuid,text,text) to service_role;
