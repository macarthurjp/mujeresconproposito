-- Centralized configurable roles for the six approved administration modules.
-- Existing user_roles assignments and the devotional review workflow are kept.

create table if not exists public.admin_permission_catalog (
  permission_key text primary key,
  module_key text not null,
  action_key text not null,
  label text not null,
  unique (module_key, action_key)
);

insert into public.admin_permission_catalog (permission_key, module_key, action_key, label) values
  ('events.view','events','view','Visualizar'), ('events.create','events','create','Crear'), ('events.edit','events','edit','Editar'), ('events.delete','events','delete','Eliminar'),
  ('devotionals.view','devotionals','view','Visualizar'), ('devotionals.create','devotionals','create','Crear'), ('devotionals.edit','devotionals','edit','Editar'), ('devotionals.delete','devotionals','delete','Eliminar'), ('devotionals.publish','devotionals','publish','Publicar'),
  ('gallery.view','gallery','view','Visualizar imágenes'), ('gallery.add','gallery','add','Agregar imágenes'), ('gallery.edit','gallery','edit','Modificar imágenes'), ('gallery.delete','gallery','delete','Eliminar imágenes'),
  ('content.view','content','view','Visualizar'), ('content.create','content','create','Crear'), ('content.edit','content','edit','Editar'), ('content.delete','content','delete','Eliminar'), ('content.publish','content','publish','Publicar'),
  ('notices.view','notices','view','Acceder al módulo'), ('notices.send','notices','send','Enviar avisos'),
  ('dashboard.view','dashboard','view','Visualizar')
on conflict (permission_key) do update set module_key = excluded.module_key, action_key = excluded.action_key, label = excluded.label;

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin_roles_name_lower_idx on public.admin_roles (lower(name));

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_key text not null references public.admin_permission_catalog(permission_key) on delete cascade,
  primary key (role_id, permission_key)
);

create table if not exists public.admin_role_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);
create index if not exists admin_role_assignments_role_idx on public.admin_role_assignments(role_id);

create table if not exists public.admin_user_permission_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.admin_permission_catalog(permission_key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

insert into public.admin_roles (name, description) values
  ('Manager','Rol configurable para gestionar los módulos asignados.'),
  ('Editor','Rol configurable para editar contenido permitido.'),
  ('Viewer','Rol configurable de solo lectura.')
on conflict (lower(name)) do nothing;

alter table public.admin_permission_catalog enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_role_assignments enable row level security;
alter table public.admin_user_permission_overrides enable row level security;

drop policy if exists "authenticated read admin permission catalog" on public.admin_permission_catalog;
create policy "authenticated read admin permission catalog" on public.admin_permission_catalog
  for select to authenticated using (true);

drop policy if exists "super admins manage admin roles" on public.admin_roles;
create policy "super admins manage admin roles" on public.admin_roles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "super admins manage admin role permissions" on public.admin_role_permissions;
create policy "super admins manage admin role permissions" on public.admin_role_permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "super admins manage admin role assignments" on public.admin_role_assignments;
create policy "super admins manage admin role assignments" on public.admin_role_assignments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
-- A person can read their own assignment and the name of their own role (to show it in their panel).
drop policy if exists "users read own role assignment" on public.admin_role_assignments;
create policy "users read own role assignment" on public.admin_role_assignments for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "users read own role" on public.admin_roles;
create policy "users read own role" on public.admin_roles for select to authenticated
  using (exists (select 1 from public.admin_role_assignments a where a.role_id = admin_roles.id and a.user_id = auth.uid()));
drop policy if exists "super admins manage admin permission overrides" on public.admin_user_permission_overrides;
create policy "super admins manage admin permission overrides" on public.admin_user_permission_overrides for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

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

create or replace function public.admin_current_module_permissions()
returns table(module_key text, action_key text, permission_key text, allowed boolean)
language sql stable security definer set search_path = '' as $$
  select c.module_key, c.action_key, c.permission_key, public.has_admin_module_permission(c.module_key,c.action_key)
  from public.admin_permission_catalog c order by c.module_key,c.action_key;
$$;
revoke all on function public.admin_current_module_permissions() from public, anon;
grant execute on function public.admin_current_module_permissions() to authenticated;

create or replace function public.admin_save_role(p_name text, p_description text default '', p_role_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede administrar roles.' using errcode='42501'; end if;
  if nullif(btrim(p_name),'') is null or length(btrim(p_name)) > 80 then raise exception 'El nombre del rol es obligatorio (máximo 80 caracteres).'; end if;
  if p_role_id is null then
    insert into public.admin_roles(name,description,created_by) values (btrim(p_name),left(coalesce(p_description,''),300),auth.uid()) returning id into result_id;
  else
    update public.admin_roles set name=btrim(p_name),description=left(coalesce(p_description,''),300),updated_at=now() where id=p_role_id returning id into result_id;
    if result_id is null then raise exception 'No se encontró el rol.'; end if;
  end if;
  return result_id;
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

create or replace function public.admin_assign_role(p_email text, p_role_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede asignar roles.' using errcode='42501'; end if;
  if not exists(select 1 from public.admin_roles where id=p_role_id) then raise exception 'No se encontró el rol.'; end if;
  select id into target_id from auth.users where lower(email)=lower(btrim(p_email));
  if target_id is null then raise exception 'No existe una cuenta con ese correo. Invita a la persona primero.'; end if;
  if not exists(select 1 from public.user_roles where user_id=target_id) then raise exception 'La cuenta no está autorizada en el panel. Invítala primero desde Usuarios y roles.'; end if;
  if exists(select 1 from public.user_roles where user_id=target_id and is_revoked) then raise exception 'Restaura el acceso de la cuenta antes de asignar un rol.'; end if;
  if exists(select 1 from public.user_roles where user_id=target_id and is_super_admin and not is_revoked) then raise exception 'La cuenta Super Admin conserva su rol protegido.'; end if;
  insert into public.admin_role_assignments(user_id,role_id,assigned_by) values(target_id,p_role_id,auth.uid())
  on conflict(user_id) do update set role_id=excluded.role_id,assigned_by=excluded.assigned_by,assigned_at=now();
  return target_id;
end;
$$;

create or replace function public.admin_remove_role_assignment(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Solo Super Admin puede revocar asignaciones.' using errcode='42501'; end if;
  delete from public.admin_role_assignments where user_id=p_user_id;
  delete from public.admin_user_permission_overrides where user_id=p_user_id;
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

do $$ declare fn regprocedure; begin
  foreach fn in array array[
    'public.admin_save_role(text,text,uuid)'::regprocedure,
    'public.admin_save_role_permissions(uuid,text[])'::regprocedure,
    'public.admin_assign_role(text,uuid)'::regprocedure,
    'public.admin_remove_role_assignment(uuid)'::regprocedure,
    'public.admin_save_user_overrides(uuid,jsonb)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end $$;

-- The six approved modules only. Public read policies remain intact.
drop policy if exists "super admin write eventos" on public.eventos;
drop policy if exists "roles manage eventos" on public.eventos;
drop policy if exists "crud write eventos" on public.eventos;
create policy "roles create eventos" on public.eventos for insert to authenticated with check (public.has_admin_module_permission('events','create'));
create policy "roles edit eventos" on public.eventos for update to authenticated using (public.has_admin_module_permission('events','edit')) with check (public.has_admin_module_permission('events','edit'));
create policy "roles delete eventos" on public.eventos for delete to authenticated using (public.has_admin_module_permission('events','delete'));

drop policy if exists "super admin write galeria" on public.galeria;
drop policy if exists "crud write galeria" on public.galeria;
create policy "roles add galeria" on public.galeria for insert to authenticated with check (public.has_admin_module_permission('gallery','add'));
create policy "roles edit galeria" on public.galeria for update to authenticated using (public.has_admin_module_permission('gallery','edit')) with check (public.has_admin_module_permission('gallery','edit'));
create policy "roles delete galeria" on public.galeria for delete to authenticated using (public.has_admin_module_permission('gallery','delete'));

drop policy if exists "super admin write destacadas" on public.destacadas;
drop policy if exists "crud write destacadas" on public.destacadas;
create policy "roles create destacadas" on public.destacadas for insert to authenticated with check (public.has_admin_module_permission('content','create'));
create policy "roles edit destacadas" on public.destacadas for update to authenticated using (public.has_admin_module_permission('content','edit')) with check (public.has_admin_module_permission('content','edit'));
create policy "roles delete destacadas" on public.destacadas for delete to authenticated using (public.has_admin_module_permission('content','delete'));

drop policy if exists "super admin write youtube" on public.youtube;
drop policy if exists "crud write youtube" on public.youtube;
drop policy if exists "authenticated write youtube" on public.youtube;
create policy "roles create youtube" on public.youtube for insert to authenticated with check (public.has_admin_module_permission('content','create'));
create policy "roles edit youtube" on public.youtube for update to authenticated using (public.has_admin_module_permission('content','edit')) with check (public.has_admin_module_permission('content','edit'));
create policy "roles delete youtube" on public.youtube for delete to authenticated using (public.has_admin_module_permission('content','delete'));

create or replace function public.admin_guard_content_activation()
returns trigger language plpgsql set search_path = '' as $$
declare content_changed boolean;
begin
  -- Audit fix: server processes (service_role, postgres) are not end users; RLS-level roles only.
  if current_user not in ('authenticated','anon') then return new; end if;
  if TG_OP='INSERT' then
    if new.activa and not public.has_admin_module_permission('content','publish') then raise exception 'No tienes permiso para publicar publicaciones.' using errcode='42501'; end if;
    return new;
  end if;
  if TG_TABLE_NAME='site_banner' then
    content_changed := (to_jsonb(new)-array['activa','updated_at']) is distinct from (to_jsonb(old)-array['activa','updated_at']);
  else
    content_changed := (to_jsonb(new)-array['activa','updated_at']) is distinct from (to_jsonb(old)-array['activa','updated_at']);
  end if;
  if content_changed and not public.has_admin_module_permission('content','edit') then raise exception 'No tienes permiso para editar publicaciones.' using errcode='42501'; end if;
  if new.activa is distinct from old.activa and not public.has_admin_module_permission('content','publish') then raise exception 'No tienes permiso para publicar o retirar publicaciones.' using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists admin_guard_content_activation_destacadas on public.destacadas;
create trigger admin_guard_content_activation_destacadas before update on public.destacadas for each row execute function public.admin_guard_content_activation();
drop trigger if exists admin_guard_content_activation_youtube on public.youtube;
create trigger admin_guard_content_activation_youtube before update on public.youtube for each row execute function public.admin_guard_content_activation();
drop trigger if exists admin_guard_content_activation_banner on public.site_banner;
create trigger admin_guard_content_activation_banner before update on public.site_banner for each row execute function public.admin_guard_content_activation();
drop trigger if exists admin_guard_content_activation_destacadas_insert on public.destacadas;
create trigger admin_guard_content_activation_destacadas_insert before insert on public.destacadas for each row execute function public.admin_guard_content_activation();
drop trigger if exists admin_guard_content_activation_youtube_insert on public.youtube;
create trigger admin_guard_content_activation_youtube_insert before insert on public.youtube for each row execute function public.admin_guard_content_activation();

drop policy if exists "super admin manage site banner" on public.site_banner;
drop policy if exists "super admin write site_banner" on public.site_banner;
create policy "roles read site banner" on public.site_banner for select to authenticated using (public.has_admin_module_permission('content','view'));
create policy "roles edit site banner" on public.site_banner for update to authenticated using (public.has_admin_module_permission('content','edit')) with check (public.has_admin_module_permission('content','edit'));
drop policy if exists "super admin write site_banner" on public.site_banner;

drop policy if exists "super admin write devocionales" on public.devocionales;
drop policy if exists "authenticated write devocionales" on public.devocionales;
drop policy if exists "editors read own devocionales" on public.devocionales;
drop policy if exists "editors insert own devocionales" on public.devocionales;
drop policy if exists "editors update own devocionales" on public.devocionales;
drop policy if exists "reviewers update queue devocionales" on public.devocionales;
drop policy if exists "reviewers read queue devocionales" on public.devocionales;
drop policy if exists "editors delete own devocionales" on public.devocionales;
drop policy if exists "super admin read devocional historial" on public.devocional_historial;
drop policy if exists "reviewers read devocional historial" on public.devocional_historial;
drop policy if exists "authors read own devocional historial" on public.devocional_historial;
drop policy if exists "roles read devotional history" on public.devocional_historial;
create policy "roles read devotional history" on public.devocional_historial for select to authenticated
  using (public.has_admin_module_permission('devotionals','view'));
create policy "roles read devocionales" on public.devocionales for select to authenticated
  using (
    public.is_super_admin()
    or (public.has_admin_module_permission('devotionals','view') and created_by=auth.uid())
    or (public.has_admin_module_permission('devotionals','view') and publicado=true)
    or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish') and created_by<>auth.uid() and (estado in ('en_revision','cambios_solicitados') or publicado=true))
  );
create policy "roles create devocionales" on public.devocionales for insert to authenticated
  with check (public.has_admin_module_permission('devotionals','create') and created_by=auth.uid());
create policy "roles update devocionales" on public.devocionales for update to authenticated
  using (
    public.is_super_admin()
    or (public.has_admin_module_permission('devotionals','edit') and created_by=auth.uid())
    or (public.has_admin_module_permission('devotionals','edit') and public.has_admin_module_permission('devotionals','publish') and created_by<>auth.uid() and (estado in ('en_revision','cambios_solicitados') or publicado=true))
  )
  with check (
    public.is_super_admin()
    or (public.has_admin_module_permission('devotionals','edit') and created_by=auth.uid())
    or (public.has_admin_module_permission('devotionals','edit') and public.has_admin_module_permission('devotionals','publish') and created_by<>auth.uid())
  );
create policy "roles delete devocionales" on public.devocionales for delete to authenticated
  using (public.is_super_admin() or (public.has_admin_module_permission('devotionals','delete') and created_by=auth.uid() and publicado=false));

create or replace function public.admin_guard_devotional_update()
returns trigger language plpgsql set search_path = '' as $$
declare content_changed boolean;
begin
  if current_setting('app.devocional_guard_bypass', true) = 'on' then return new; end if;
  if current_user not in ('authenticated','anon') then return new; end if;
  content_changed := (to_jsonb(new) - array['publicado','fecha_publicacion','updated_at']) is distinct from (to_jsonb(old) - array['publicado','fecha_publicacion','updated_at']);
  if content_changed and not public.has_admin_module_permission('devotionals','edit') then raise exception 'No tienes permiso para editar devocionales.' using errcode='42501'; end if;
  if (new.publicado is distinct from old.publicado or new.fecha_publicacion is distinct from old.fecha_publicacion)
     and not public.has_admin_module_permission('devotionals','publish') then raise exception 'No tienes permiso para publicar devocionales.' using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists admin_guard_devotional_update on public.devocionales;
create trigger admin_guard_devotional_update before update on public.devocionales
for each row execute function public.admin_guard_devotional_update();

-- Keep the existing author/reviewer state machine, adding module permission checks.
create or replace function public.devocional_submit_for_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by<>auth.uid() or not (public.has_admin_module_permission('devotionals','create') or public.has_admin_module_permission('devotionals','edit')) then raise exception 'No tienes permiso para enviar este devocional a revisión.' using errcode='42501'; end if;
  if target.estado not in ('borrador','cambios_solicitados') then raise exception 'Este devocional ya está en revisión.'; end if;
  if target.pending_content is null or coalesce(btrim(target.pending_content->>'titulo'),'')='' or coalesce(btrim(target.pending_content->>'contenido'),'')='' then raise exception 'Completa al menos el título y la reflexión antes de enviar a revisión.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='en_revision',updated_at=now() where id=p_id;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
  values(p_id,coalesce(target.titulo,target.pending_content->>'titulo'),target.slug,auth.uid(),(select email from public.user_roles where user_id=auth.uid()),'enviado_a_revision');
end;
$$;

create or replace function public.devocional_request_changes(p_id bigint,p_nota text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.devocionales%rowtype; nota text:=btrim(coalesce(p_nota,''));
begin
  if nota='' then raise exception 'Escribe una nota explicando los cambios solicitados.'; end if;
  select * into target from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by=auth.uid() or not (public.has_admin_module_permission('devotionals','edit') and public.has_admin_module_permission('devotionals','publish')) then raise exception 'No tienes permiso para revisar este devocional.' using errcode='42501'; end if;
  if target.estado<>'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='cambios_solicitados',updated_at=now() where id=p_id;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion,nota)
  values(p_id,coalesce(target.titulo,target.pending_content->>'titulo'),target.slug,auth.uid(),(select email from public.user_roles where user_id=auth.uid()),'cambios_solicitados',nota);
end;
$$;

create or replace function public.devocional_approve_and_publish(p_id bigint,p_fecha timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.devocionales%rowtype; fecha timestamptz;
begin
  select * into target from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (public.is_super_admin() or (public.has_admin_module_permission('devotionals','publish') and target.created_by<>auth.uid())) then raise exception 'No tienes permiso para aprobar este devocional.' using errcode='42501'; end if;
  if target.estado<>'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;
  if target.pending_content is null then raise exception 'No hay contenido pendiente para aprobar.'; end if;
  fecha:=coalesce(p_fecha,target.pending_fecha_publicacion,now());
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set titulo=target.pending_content->>'titulo',resumen=target.pending_content->>'resumen',contenido=target.pending_content->>'contenido',contenido_html=target.pending_content->>'contenido_html',introduccion_html=target.pending_content->>'introduccion_html',versiculo=target.pending_content->>'versiculo',categorias=coalesce((select array_agg(value) from jsonb_array_elements_text(target.pending_content->'categorias')),'{}'),autora=coalesce(nullif(target.pending_content->>'autora',''),target.autora),imagen_url=target.pending_content->>'imagen_url',publicado=true,fecha_publicacion=fecha,pending_content=null,pending_fecha_publicacion=null,estado='borrador',updated_at=now() where id=p_id;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
  values(p_id,target.pending_content->>'titulo',target.slug,auth.uid(),(select email from public.user_roles where user_id=auth.uid()),'aprobado_publicado');
end;
$$;

create or replace function public.devocional_withdraw(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (public.is_super_admin() or (target.created_by=auth.uid() and public.has_admin_module_permission('devotionals','edit')) or (target.created_by<>auth.uid() and public.has_admin_module_permission('devotionals','edit') and public.has_admin_module_permission('devotionals','publish'))) then raise exception 'No tienes permiso para retirar este devocional de revisión.' using errcode='42501'; end if;
  if target.estado<>'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='borrador',updated_at=now() where id=p_id;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
  values(p_id,coalesce(target.titulo,target.pending_content->>'titulo'),target.slug,auth.uid(),(select email from public.user_roles where user_id=auth.uid()),'retirado');
end;
$$;

create or replace function public.devocional_unpublish(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not public.is_super_admin() then raise exception 'Solo el Super Admin puede retirar un devocional publicado.' using errcode='42501'; end if;
  if not target.publicado then raise exception 'Este devocional no está publicado.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set publicado=false,fecha_publicacion=null,updated_at=now() where id=p_id;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
  values(p_id,target.titulo,target.slug,auth.uid(),(select email from public.user_roles where user_id=auth.uid()),'despublicado');
end;
$$;

revoke all on function public.devocional_submit_for_review(bigint), public.devocional_request_changes(bigint,text), public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint), public.devocional_unpublish(bigint) from public, anon;
grant execute on function public.devocional_submit_for_review(bigint), public.devocional_request_changes(bigint,text), public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint), public.devocional_unpublish(bigint) to authenticated;

drop policy if exists "super admin upload mcp930 images" on storage.objects;
drop policy if exists "super admin update mcp930 images" on storage.objects;
drop policy if exists "super admin delete mcp930 images" on storage.objects;
drop policy if exists "crud upload mcp930 images" on storage.objects;
drop policy if exists "crud update mcp930 images" on storage.objects;
drop policy if exists "crud delete mcp930 images" on storage.objects;
drop policy if exists "editors upload devotional images" on storage.objects;
drop policy if exists "editorial upload devotional images" on storage.objects;
create policy "role upload admin images" on storage.objects for insert to authenticated with check (
  bucket_id='mcp930-images' and (
    ((storage.foldername(name))[1]='galeria' and (public.has_admin_module_permission('gallery','add') or public.has_admin_module_permission('gallery','edit'))) or
    ((storage.foldername(name))[1]='eventos' and (public.has_admin_module_permission('events','create') or public.has_admin_module_permission('events','edit'))) or
    ((storage.foldername(name))[1]='devocionales' and (public.has_admin_module_permission('devotionals','create') or public.has_admin_module_permission('devotionals','edit'))) or
    ((storage.foldername(name))[1] in ('destacadas','uploads','banner') and (public.has_admin_module_permission('content','create') or public.has_admin_module_permission('content','edit')))
  ));
create policy "role update admin images" on storage.objects for update to authenticated using (
  bucket_id='mcp930-images' and (
    ((storage.foldername(name))[1]='galeria' and public.has_admin_module_permission('gallery','edit')) or
    ((storage.foldername(name))[1]='eventos' and public.has_admin_module_permission('events','edit')) or
    ((storage.foldername(name))[1]='devocionales' and public.has_admin_module_permission('devotionals','edit')) or
    ((storage.foldername(name))[1] in ('destacadas','uploads','banner') and public.has_admin_module_permission('content','edit'))
  )) with check (
  bucket_id='mcp930-images' and (
    ((storage.foldername(name))[1]='galeria' and public.has_admin_module_permission('gallery','edit')) or
    ((storage.foldername(name))[1]='eventos' and public.has_admin_module_permission('events','edit')) or
    ((storage.foldername(name))[1]='devocionales' and public.has_admin_module_permission('devotionals','edit')) or
    ((storage.foldername(name))[1] in ('destacadas','uploads','banner') and public.has_admin_module_permission('content','edit'))
  ));
create policy "role delete admin images" on storage.objects for delete to authenticated using (
  bucket_id='mcp930-images' and (
    ((storage.foldername(name))[1]='galeria' and public.has_admin_module_permission('gallery','delete')) or
    ((storage.foldername(name))[1]='eventos' and public.has_admin_module_permission('events','delete')) or
    ((storage.foldername(name))[1]='devocionales' and public.has_admin_module_permission('devotionals','delete')) or
    ((storage.foldername(name))[1] in ('destacadas','uploads','banner') and public.has_admin_module_permission('content','delete'))
  ));

create or replace function public.admin_dashboard_members()
returns setof public.unirse language plpgsql stable security definer set search_path = '' as $$
declare can_read_private boolean := public.is_super_admin() or public.has_permission('read_export');
begin
  if not public.has_admin_module_permission('dashboard','view') then raise exception 'No tienes permiso para ver el dashboard.' using errcode='42501'; end if;
  return query select (jsonb_populate_record(null::public.unirse,
    case when can_read_private then to_jsonb(member) else to_jsonb(member)-array['email','telefono','fecha_nacimiento','pais_nacimiento','estatus_matrimonial','hijos','comments','birthday_event_id','ultimo_correo_cumpleanos']::text[] end)).*
  from public.unirse as member order by member.created_at desc;
end;
$$;
revoke all on function public.admin_dashboard_members() from public, anon;
grant execute on function public.admin_dashboard_members() to authenticated;

-- Audit fix: a dashboard denial must also block direct table reads of member records.
drop policy if exists "permissions read unirse" on public.unirse;
create policy "permissions read unirse" on public.unirse for select to authenticated
  using (public.is_super_admin() or (public.has_permission('read_export') and public.has_admin_module_permission('dashboard','view')));

drop policy if exists "team reads metrics" on public.metricas_diarias;
create policy "dashboard roles read metrics" on public.metricas_diarias for select to authenticated
  using (public.has_admin_module_permission('dashboard','view'));

drop policy if exists "team reads inscripciones" on public.inscripciones;
create policy "content roles read inscripciones" on public.inscripciones for select to authenticated
  using (public.has_admin_module_permission('content','edit'));
drop policy if exists "super admin deletes inscripciones" on public.inscripciones;
create policy "content roles delete inscripciones" on public.inscripciones for delete to authenticated
  using (public.has_admin_module_permission('content','delete'));

drop policy if exists "super admin reads broadcasts" on public.push_broadcasts;
drop policy if exists "roles read broadcasts" on public.push_broadcasts;
create policy "roles read broadcasts" on public.push_broadcasts for select to authenticated
  using (public.has_admin_module_permission('notices','view'));

