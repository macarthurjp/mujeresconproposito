-- Rollback for 20261116120000_central_admin_roles.sql.
-- Restores the exact policies and functions that production had before the migration
-- (exported read-only from production on 2026-11-16) and removes the RBAC objects.
-- Run as a single transaction. Role assignments/overrides created after the migration are lost.
begin;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where (schemaname='public' and tablename in ('eventos','galeria','destacadas','youtube','site_banner','devocionales','devocional_historial','inscripciones','push_broadcasts','metricas_diarias','unirse')) or (schemaname='storage' and tablename='objects' and policyname in ('role upload admin images','role update admin images','role delete admin images','super admin upload mcp930 images','super admin update mcp930 images','super admin delete mcp930 images','editorial upload devotional images')) loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop; end $$;
create policy "public read destacadas" on public.destacadas as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy "super admin write destacadas" on public.destacadas as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "authors read own devocional historial" on public.devocional_historial as PERMISSIVE for SELECT to authenticated using ((has_permission('editor'::text) AND (devocional_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM devocionales d
  WHERE ((d.id = devocional_historial.devocional_id) AND (d.created_by = auth.uid()))))));
create policy "reviewers read devocional historial" on public.devocional_historial as PERMISSIVE for SELECT to authenticated using (has_permission('reviewer'::text));
create policy "super admin read devocional historial" on public.devocional_historial as PERMISSIVE for SELECT to authenticated using (is_super_admin());
create policy "editors delete own devocionales" on public.devocionales as PERMISSIVE for DELETE to authenticated using ((has_permission('editor'::text) AND (created_by = auth.uid()) AND (publicado = false)));
create policy "editors insert own devocionales" on public.devocionales as PERMISSIVE for INSERT to authenticated with check ((has_permission('editor'::text) AND (created_by = auth.uid())));
create policy "editors read own devocionales" on public.devocionales as PERMISSIVE for SELECT to authenticated using ((has_permission('editor'::text) AND (created_by = auth.uid())));
create policy "editors update own devocionales" on public.devocionales as PERMISSIVE for UPDATE to authenticated using ((has_permission('editor'::text) AND (created_by = auth.uid()))) with check ((has_permission('editor'::text) AND (created_by = auth.uid())));
create policy "public read published devocionales" on public.devocionales as PERMISSIVE for SELECT to anon,authenticated using (((publicado = true) AND (fecha_publicacion IS NOT NULL) AND (fecha_publicacion <= now())));
create policy "reviewers read queue devocionales" on public.devocionales as PERMISSIVE for SELECT to authenticated using ((has_permission('reviewer'::text) AND (created_by <> auth.uid()) AND ((estado = ANY (ARRAY['en_revision'::text, 'cambios_solicitados'::text])) OR (publicado = true))));
create policy "reviewers update queue devocionales" on public.devocionales as PERMISSIVE for UPDATE to authenticated using ((has_permission('reviewer'::text) AND (created_by <> auth.uid()) AND ((estado = ANY (ARRAY['en_revision'::text, 'cambios_solicitados'::text])) OR (publicado = true)))) with check ((has_permission('reviewer'::text) AND (created_by <> auth.uid())));
create policy "super admin write devocionales" on public.devocionales as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "public read eventos" on public.eventos as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy "super admin write eventos" on public.eventos as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "public read galeria" on public.galeria as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy "super admin write galeria" on public.galeria as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "super admin deletes inscripciones" on public.inscripciones as PERMISSIVE for DELETE to authenticated using (is_super_admin());
create policy "team reads inscripciones" on public.inscripciones as PERMISSIVE for SELECT to authenticated using ((is_super_admin() OR has_permission('read_export'::text)));
create policy "team reads metrics" on public.metricas_diarias as PERMISSIVE for SELECT to authenticated using ((is_super_admin() OR has_permission('read_export'::text)));
create policy "super admin reads broadcasts" on public.push_broadcasts as PERMISSIVE for SELECT to authenticated using (is_super_admin());
create policy "public read site_banner" on public.site_banner as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy "super admin write site_banner" on public.site_banner as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "permissions read unirse" on public.unirse as PERMISSIVE for SELECT to authenticated using ((is_super_admin() OR has_permission('read_export'::text)));
create policy "super admin delete unirse" on public.unirse as PERMISSIVE for DELETE to authenticated using (is_super_admin());
create policy "super admin update unirse" on public.unirse as PERMISSIVE for UPDATE to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "public read youtube" on public.youtube as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy "super admin write youtube" on public.youtube as PERMISSIVE for ALL to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "editorial upload devotional images" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'mcp930-images'::text) AND (has_permission('editor'::text) OR has_permission('reviewer'::text)) AND ((storage.foldername(name))[1] = 'devocionales'::text)));
create policy "super admin delete mcp930 images" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'mcp930-images'::text) AND is_super_admin()));
create policy "super admin update mcp930 images" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'mcp930-images'::text) AND is_super_admin())) with check (((bucket_id = 'mcp930-images'::text) AND is_super_admin()));
create policy "super admin upload mcp930 images" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'mcp930-images'::text) AND is_super_admin()));

drop trigger if exists admin_guard_content_activation_destacadas on public.destacadas;
drop trigger if exists admin_guard_content_activation_youtube on public.youtube;
drop trigger if exists admin_guard_content_activation_banner on public.site_banner;
drop trigger if exists admin_guard_content_activation_destacadas_insert on public.destacadas;
drop trigger if exists admin_guard_content_activation_youtube_insert on public.youtube;
drop trigger if exists admin_guard_devotional_update on public.devocionales;
drop function if exists public.admin_guard_content_activation();
drop function if exists public.admin_guard_devotional_update();

CREATE OR REPLACE FUNCTION public.admin_dashboard_members()
 RETURNS SETOF unirse
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.devocional_approve_and_publish(p_id bigint, p_fecha timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.devocionales%rowtype;
  fecha timestamptz;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (public.is_super_admin() or (public.has_permission('reviewer') and target.created_by <> auth.uid())) then
    raise exception 'No tienes permiso para aprobar este devocional.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;
  if target.pending_content is null then raise exception 'No hay contenido pendiente para aprobar.'; end if;

  fecha := coalesce(p_fecha, target.pending_fecha_publicacion, now());

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set
    titulo = target.pending_content->>'titulo',
    resumen = target.pending_content->>'resumen',
    contenido = target.pending_content->>'contenido',
    contenido_html = target.pending_content->>'contenido_html',
    introduccion_html = target.pending_content->>'introduccion_html',
    versiculo = target.pending_content->>'versiculo',
    categorias = coalesce((select array_agg(value) from jsonb_array_elements_text(target.pending_content->'categorias')), '{}'),
    autora = coalesce(nullif(target.pending_content->>'autora', ''), target.autora),
    imagen_url = target.pending_content->>'imagen_url',
    publicado = true,
    fecha_publicacion = fecha,
    pending_content = null,
    pending_fecha_publicacion = null,
    estado = 'borrador',
    updated_at = now()
  where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, target.pending_content->>'titulo', target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'aprobado_publicado');
end;
$function$;
CREATE OR REPLACE FUNCTION public.devocional_request_changes(p_id bigint, p_nota text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.devocionales%rowtype;
  nota text := btrim(coalesce(p_nota, ''));
begin
  if nota = '' then raise exception 'Escribe una nota explicando los cambios solicitados.'; end if;
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by = auth.uid() or not public.has_permission('reviewer') then
    raise exception 'No tienes permiso para revisar este devocional.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'cambios_solicitados', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion, nota)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'cambios_solicitados', nota);
end;
$function$;
CREATE OR REPLACE FUNCTION public.devocional_submit_for_review(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if target.created_by <> auth.uid() or not public.has_permission('editor') then
    raise exception 'No tienes permiso para enviar este devocional a revisión.' using errcode = '42501';
  end if;
  if target.estado not in ('borrador', 'cambios_solicitados') then
    raise exception 'Este devocional ya está en revisión.';
  end if;
  if target.pending_content is null
     or coalesce(btrim(target.pending_content->>'titulo'), '') = ''
     or coalesce(btrim(target.pending_content->>'contenido'), '') = '' then
    raise exception 'Completa al menos el título y la reflexión antes de enviar a revisión.';
  end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'en_revision', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'enviado_a_revision');
end;
$function$;
CREATE OR REPLACE FUNCTION public.devocional_unpublish(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not public.is_super_admin() then
    raise exception 'Solo el Super Admin puede retirar un devocional publicado.' using errcode = '42501';
  end if;
  if not target.publicado then raise exception 'Este devocional no está publicado.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set publicado = false, fecha_publicacion = null, updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, target.titulo, target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'despublicado');
end;
$function$;
CREATE OR REPLACE FUNCTION public.devocional_withdraw(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.devocionales%rowtype;
begin
  select * into target from public.devocionales where id = p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (
    public.is_super_admin()
    or (public.has_permission('editor') and target.created_by = auth.uid())
    or (public.has_permission('reviewer') and target.created_by <> auth.uid())
  ) then
    raise exception 'No tienes permiso para retirar este devocional de revisión.' using errcode = '42501';
  end if;
  if target.estado <> 'en_revision' then raise exception 'Este devocional no está en revisión.'; end if;

  perform set_config('app.devocional_guard_bypass', 'on', true);
  update public.devocionales set estado = 'borrador', updated_at = now() where id = p_id;

  insert into public.devocional_historial (devocional_id, devocional_titulo, devocional_slug, actor_id, actor_email, accion)
  values (p_id, coalesce(target.titulo, target.pending_content->>'titulo'), target.slug, auth.uid(),
    (select email from public.user_roles where user_id = auth.uid()), 'retirado');
end;
$function$;

drop function if exists public.admin_save_user_overrides(uuid,jsonb);
drop function if exists public.admin_remove_role_assignment(uuid);
drop function if exists public.admin_assign_role(text,uuid);
drop function if exists public.admin_save_role_permissions(uuid,text[]);
drop function if exists public.admin_save_role(text,text,uuid);
drop function if exists public.admin_current_module_permissions();
drop function if exists public.admin_user_has_permission(uuid,text,text);
drop function if exists public.has_admin_module_permission(text,text);
drop table if exists public.admin_user_permission_overrides;
drop table if exists public.admin_role_assignments;
drop table if exists public.admin_role_permissions;
drop table if exists public.admin_roles;
drop table if exists public.admin_permission_catalog;

-- Execute grants exactly as production had them before the migration.
revoke all on function public.admin_dashboard_members() from public, anon;
grant execute on function public.admin_dashboard_members() to authenticated, service_role;
revoke all on function public.devocional_submit_for_review(bigint), public.devocional_request_changes(bigint,text), public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint), public.devocional_unpublish(bigint) from public;
grant execute on function public.devocional_submit_for_review(bigint), public.devocional_request_changes(bigint,text), public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint), public.devocional_unpublish(bigint) to anon, authenticated, service_role;

commit;
