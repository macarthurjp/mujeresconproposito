-- One permission system. The legacy per-user toggles "Editor de devocionales" (editor),
-- "Revisor de devocionales" (reviewer) and "Manager (exportar)" (read_export) are
-- replaced by role permissions:
--   editor      -> devotionals.create / devotionals.edit (own articles)
--   reviewer    -> devotionals.publish (review and approve others' articles)
--   read_export -> dashboard.contacts (contacts + PDF/CSV export)
--                  dashboard.followup (member follow-up + statistics)
-- Nobody had those legacy toggles enabled when this was written (verified).

insert into public.admin_permission_catalog (permission_key, module_key, action_key, label) values
  ('dashboard.contacts', 'dashboard', 'contacts', 'Ver contactos y exportar'),
  ('dashboard.followup', 'dashboard', 'followup', 'Seguimiento y estadísticas')
on conflict (permission_key) do update set module_key = excluded.module_key, action_key = excluded.action_key, label = excluded.label;

-- Remove the legacy toggles from every account (read_only and birthday_calendar stay).
update public.user_roles
   set permissions = array(select p from unnest(permissions) p where p not in ('editor','reviewer','read_export','crud'))
 where permissions && array['editor','reviewer','read_export','crud'];

-- Effective permission: Super Admin, or the assigned role (+ individual exceptions). Nothing else.
create or replace function public.has_admin_module_permission(p_module text, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  permission_name text := p_module || '.' || p_action;
  assigned_role uuid;
  overridden boolean;
begin
  if uid is null or not exists (select 1 from public.admin_permission_catalog where permission_key = permission_name) then return false; end if;
  if public.is_super_admin() then return true; end if;
  if not exists (select 1 from public.user_roles where user_id = uid and not is_revoked) then return false; end if;
  if p_action <> 'view' and public.admin_user_is_view_only(uid) then return false; end if;
  select allowed into overridden from public.admin_user_permission_overrides where user_id = uid and permission_key = permission_name;
  if found then return overridden; end if;
  select role_id into assigned_role from public.admin_role_assignments where user_id = uid;
  if not found then return false; end if;
  return exists (select 1 from public.admin_role_permissions where role_id = assigned_role and permission_key = permission_name);
end;
$$;
revoke all on function public.has_admin_module_permission(text,text) from public, anon;
grant execute on function public.has_admin_module_permission(text,text) to authenticated;

create or replace function public.admin_user_has_permission(p_user_id uuid, p_module text, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare allowed_value boolean; assigned_role uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.admin_permission_catalog where permission_key = p_module || '.' || p_action) then return false; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and not is_revoked) then return false; end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and is_super_admin and not is_revoked) then return true; end if;
  if p_action <> 'view' and public.admin_user_is_view_only(p_user_id) then return false; end if;
  select allowed into allowed_value from public.admin_user_permission_overrides where user_id = p_user_id and permission_key = p_module || '.' || p_action;
  if found then return allowed_value; end if;
  select role_id into assigned_role from public.admin_role_assignments where user_id = p_user_id;
  if not found then return false; end if;
  return exists (select 1 from public.admin_role_permissions where role_id = assigned_role and permission_key = p_module || '.' || p_action);
end;
$$;
revoke all on function public.admin_user_has_permission(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_user_has_permission(uuid,text,text) to service_role;

-- Emails of everyone with an effective permission (server-side notifications).
create or replace function public.admin_users_with_permission(p_module text, p_action text)
returns table(user_id uuid, email text) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select u.user_id, u.email from public.user_roles u
    where not u.is_revoked and coalesce(u.email,'') <> '' and public.admin_user_has_permission(u.user_id, p_module, p_action);
end;
$$;
revoke all on function public.admin_users_with_permission(text,text) from public, anon, authenticated;
grant execute on function public.admin_users_with_permission(text,text) to service_role;

-- Member records: contacts only with dashboard.contacts.
drop policy if exists "permissions read unirse" on public.unirse;
create policy "permissions read unirse" on public.unirse for select to authenticated
  using (public.is_super_admin() or (public.has_admin_module_permission('dashboard','view')
         and (public.has_admin_module_permission('dashboard','contacts') or public.has_admin_module_permission('dashboard','followup'))));

create or replace function public.admin_dashboard_members()
returns setof public.unirse language plpgsql stable security definer set search_path = '' as $$
declare can_read_private boolean := public.is_super_admin() or public.has_admin_module_permission('dashboard','contacts');
begin
  if not public.has_admin_module_permission('dashboard','view') then raise exception 'No tienes permiso para ver el dashboard.' using errcode='42501'; end if;
  return query select (jsonb_populate_record(null::public.unirse,
    case when can_read_private then to_jsonb(member) else to_jsonb(member)-array['email','telefono','fecha_nacimiento','pais_nacimiento','estatus_matrimonial','hijos','comments','birthday_event_id','ultimo_correo_cumpleanos']::text[] end)).*
  from public.unirse as member order by member.created_at desc;
end;
$$;
revoke all on function public.admin_dashboard_members() from public, anon;
grant execute on function public.admin_dashboard_members() to authenticated;

-- Follow-up and statistics: dashboard.followup.
create or replace function public.set_member_followup(p_id uuid, p_estado text, p_contactada_por text, p_notas text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_module_permission('dashboard','followup') then
    raise exception 'No tienes permiso para actualizar el seguimiento.' using errcode = '42501';
  end if;
  if p_estado not in ('nueva', 'contactada', 'integrada', 'sin_respuesta') then raise exception 'Estado inválido'; end if;
  update public.unirse
     set estado_seguimiento = p_estado,
         contactada_por = nullif(left(trim(coalesce(p_contactada_por, '')), 120), ''),
         notas_seguimiento = nullif(left(trim(coalesce(p_notas, '')), 2000), ''),
         seguimiento_at = now()
   where id = p_id;
end; $$;
revoke all on function public.set_member_followup(uuid, text, text, text) from public, anon;
grant execute on function public.set_member_followup(uuid, text, text, text) to authenticated;

-- Statistics: dashboard.followup.
create or replace function public.estadisticas_panel()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.has_admin_module_permission('dashboard','followup') then
    raise exception 'No tienes permiso para ver estadísticas.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'miembros_total', (select count(*) from public.unirse),
    'registros_por_mes', (select coalesce(jsonb_agg(x order by x->>'mes'), '[]') from (
        select jsonb_build_object('mes', to_char(date_trunc('month', created_at), 'YYYY-MM'), 'total', count(*)) x
        from public.unirse where created_at >= date_trunc('month', now()) - interval '11 months'
        group by date_trunc('month', created_at)) m),
    'por_comunidad', (select coalesce(jsonb_agg(jsonb_build_object('comunidad', coalesce(comunidad, 'Sin indicar'), 'total', n) order by n desc), '[]')
        from (select comunidad, count(*) n from public.unirse group by comunidad) c),
    'seguimiento', (select coalesce(jsonb_object_agg(estado_seguimiento, n), '{}') from (select estado_seguimiento, count(*) n from public.unirse group by 1) s),
    'dispositivos_app', (select count(*) from public.push_tokens where activo),
    'devocionales_leidos', (select coalesce(jsonb_agg(jsonb_build_object('titulo', d.titulo, 'lecturas', t.total) order by t.total desc), '[]')
        from (select ref, sum(total) total from public.metricas_diarias where tipo = 'lectura_devocional' and dia >= current_date - 30 group by ref order by 2 desc limit 5) t
        join public.devocionales d on d.slug = t.ref),
    'unirme_reuniones', (select coalesce(jsonb_agg(jsonb_build_object('titulo', e.titulo, 'clics', t.total) order by t.total desc), '[]')
        from (select ref, sum(total) total from public.metricas_diarias where tipo = 'unirme_reunion' and dia >= current_date - 30 group by ref) t
        join public.eventos e on e.id::text = t.ref),
    'inscripciones', (select coalesce(jsonb_agg(jsonb_build_object('evento', coalesce(nullif(de.nombre, ''), de.titulo), 'personas', t.personas, 'cupo', de.cupo) order by t.personas desc), '[]')
        from (select destacada_id, sum(1 + acompanantes) personas from public.inscripciones group by 1) t
        join public.destacadas de on de.id::text = t.destacada_id)
  ) into result;
  return result;
end; $$;
revoke all on function public.estadisticas_panel() from public, anon;
grant execute on function public.estadisticas_panel() to authenticated;
