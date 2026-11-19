-- Rollback for 20261119100000_devocional_editorial_v2.sql.
-- Restores the production behaviour of 2026-11-17 (central_admin_roles +
-- review workflow). New columns stay (unused, harmless); data is preserved.
begin;

do $$ declare j bigint; begin
  for j in select jobid from cron.job where jobname in ('mcp930-devocional-publish-due','mcp930-devocional-updates-email') loop
    perform cron.unschedule(j); end loop;
end $$;

-- Map v2 states back to the old ones before restoring the old constraint.
alter table public.devocionales disable trigger devocionales_guard_direct_writes;
update public.devocionales set estado='en_revision' where estado in ('pendiente_revision','en_revision');
update public.devocionales set estado='borrador' where estado in ('publicado','programado');
update public.devocionales set estado='borrador', publicado=false where estado='eliminado';
alter table public.devocionales enable trigger devocionales_guard_direct_writes;
alter table public.devocionales drop constraint if exists devocionales_estado_check;
alter table public.devocionales add constraint devocionales_estado_check check (estado in ('borrador','en_revision','cambios_solicitados'));
-- Keep v2 history rows readable: widen nothing, just allow the values that now exist.
alter table public.devocional_historial drop constraint if exists devocional_historial_accion_check;
alter table public.devocional_historial add constraint devocional_historial_accion_check
  check (accion in ('creado','editado','guardado_automatico','enviado_a_revision','revision_tomada','revision_liberada','cambios_solicitados',
                    'retirado','aprobado_publicado','programado','publicado','despublicado','devuelto_a_borrador','eliminado'));

create or replace function public.devocionales_guard_direct_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() or current_setting('app.devocional_guard_bypass', true) = 'on' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.titulo is not null or new.resumen is not null or new.contenido is not null
       or new.introduccion_html is not null or new.contenido_html is not null
       or new.versiculo is not null or new.imagen_url is not null
       or new.publicado is true or new.fecha_publicacion is not null
       or new.estado <> 'borrador' then
      raise exception 'Los artículos nuevos deben crearse mediante pending_content.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.resumen is distinct from old.resumen
     or new.contenido is distinct from old.contenido
     or new.introduccion_html is distinct from old.introduccion_html
     or new.contenido_html is distinct from old.contenido_html
     or new.versiculo is distinct from old.versiculo
     or new.categorias is distinct from old.categorias
     or new.autora is distinct from old.autora
     or new.imagen_url is distinct from old.imagen_url
     or new.publicado is distinct from old.publicado
     or new.fecha_publicacion is distinct from old.fecha_publicacion
     or new.estado is distinct from old.estado then
    raise exception 'No puedes modificar contenido publicado directamente; usa el flujo de revisión.' using errcode = '42501';
  end if;
  return new;
end;
$$;


drop policy if exists "roles read devocionales" on public.devocionales;
drop policy if exists "roles update devocionales" on public.devocionales;
create policy "roles read devocionales" on public.devocionales for select to authenticated
  using (
    public.is_super_admin()
    or (public.has_admin_module_permission('devotionals','view') and created_by=auth.uid())
    or (public.has_admin_module_permission('devotionals','view') and publicado=true)
    or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish') and created_by<>auth.uid() and (estado in ('en_revision','cambios_solicitados') or publicado=true))
  );
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

create or replace function public.devocional_withdraw(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;


drop function if exists public.devocional_claim_review(bigint);
drop function if exists public.devocional_release_review(bigint);
drop function if exists public.devocional_soft_delete(bigint);
drop function if exists public.devocional_publish_due();
drop function if exists public.devocional_notify_author(text, public.devocionales, text);
drop function if exists public.devocional_apply_pending(bigint);
drop function if exists public.devocional_can_review();
drop function if exists public.devocional_can_author();
drop table if exists public.devocional_email_outbox;

commit;
