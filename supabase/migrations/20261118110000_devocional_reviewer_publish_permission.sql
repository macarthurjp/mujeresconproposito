-- Reviewer access is intentionally separate from author editing. A reviewer
-- needs view + publish, but must not gain permission to edit another author's
-- pending article.
drop policy if exists "roles read devocionales" on public.devocionales;
create policy "roles read devocionales" on public.devocionales for select to authenticated
using (
  public.is_super_admin()
  or (public.has_admin_module_permission('devotionals','view') and created_by=auth.uid())
  or publicado=true
  or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish') and created_by<>auth.uid() and estado in ('pendiente_revision','en_revision'))
);

create or replace function public.devocional_claim_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
 select * into a from public.devocionales where id=p_id for update;
 if not found then raise exception 'Devocional no encontrado.'; end if;
 if a.created_by=auth.uid() then raise exception 'No puedes revisar tu propio devocional.' using errcode='42501'; end if;
 if not (public.is_super_admin() or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish'))) then raise exception 'No tienes permiso para tomar revisiones.' using errcode='42501'; end if;
 if a.estado<>'pendiente_revision' then raise exception 'Este devocional ya fue tomado o no está pendiente.'; end if;
 perform set_config('app.devocional_guard_bypass','on',true);
 update public.devocionales set estado='en_revision',reviewer_id=auth.uid(),review_started_at=now(),updated_at=now() where id=p_id returning * into a;
 perform set_config('app.devocional_guard_bypass','off',true);
 insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion) values(p_id,a.pending_content->>'titulo',a.slug,auth.uid(),auth.jwt()->>'email','revision_tomada');
 perform public.devocional_queue_email('revision_tomada',a,null);
end $$;

create or replace function public.devocional_release_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
 select * into a from public.devocionales where id=p_id for update;
 if not found then raise exception 'Devocional no encontrado.'; end if;
 if a.estado<>'en_revision' or a.reviewer_id is distinct from auth.uid() then raise exception 'Solo la revisora asignada puede liberar esta revisión.' using errcode='42501'; end if;
 if not (public.is_super_admin() or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish'))) then raise exception 'Ya no tienes permiso para liberar esta revisión.' using errcode='42501'; end if;
 perform set_config('app.devocional_guard_bypass','on',true);
 update public.devocionales set estado='pendiente_revision',reviewer_id=null,review_started_at=null,updated_at=now() where id=p_id returning * into a;
 perform set_config('app.devocional_guard_bypass','off',true);
 insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion) values(p_id,a.pending_content->>'titulo',a.slug,auth.uid(),auth.jwt()->>'email','revision_liberada');
 perform public.devocional_queue_email('revision_liberada',a,null);
end $$;

create or replace function public.devocional_request_changes(p_id bigint,p_nota text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype; n text:=btrim(coalesce(p_nota,''));
begin
 if n='' then raise exception 'Escribe una nota explicando los cambios solicitados.'; end if;
 select * into a from public.devocionales where id=p_id for update;
 if not found then raise exception 'Devocional no encontrado.'; end if;
 if a.created_by=auth.uid() or a.reviewer_id is distinct from auth.uid() or a.estado<>'en_revision' or not (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish')) then raise exception 'Solo la revisora asignada puede solicitar cambios.' using errcode='42501'; end if;
 perform set_config('app.devocional_guard_bypass','on',true);
 update public.devocionales set estado='cambios_solicitados',reviewer_id=null,review_started_at=null,updated_at=now() where id=p_id returning * into a;
 perform set_config('app.devocional_guard_bypass','off',true);
 insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion,nota) values(p_id,a.pending_content->>'titulo',a.slug,auth.uid(),auth.jwt()->>'email','cambios_solicitados',n);
 perform public.devocional_queue_email('cambios_solicitados',a,n);
end $$;

create or replace function public.devocional_approve_and_publish(p_id bigint,p_fecha timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype; when_at timestamptz:=coalesce(p_fecha,now()); next_state text;
begin
 select * into a from public.devocionales where id=p_id for update;
 if not found then raise exception 'Devocional no encontrado.'; end if;
 if a.created_by=auth.uid() then raise exception 'No puedes aprobar tu propio devocional.' using errcode='42501'; end if;
 if a.estado<>'en_revision' or a.reviewer_id is distinct from auth.uid() then raise exception 'Toma la revisión antes de aprobar.'; end if;
 if not (public.is_super_admin() or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish'))) then raise exception 'No tienes permiso para aprobar.' using errcode='42501'; end if;
 if a.pending_content is null then raise exception 'No hay contenido pendiente para aprobar.'; end if;
 next_state:=case when when_at>now() then 'programado' else 'publicado' end;
 perform set_config('app.devocional_guard_bypass','on',true);
 update public.devocionales set
   titulo=a.pending_content->>'titulo',resumen=a.pending_content->>'resumen',contenido=a.pending_content->>'contenido',
   contenido_html=a.pending_content->>'contenido_html',introduccion_html=a.pending_content->>'introduccion_html',
   aplicacion_html=a.pending_content->>'aplicacion_html',oracion_html=a.pending_content->>'oracion_html',
   versiculo=a.pending_content->>'versiculo',categorias=coalesce(array(select jsonb_array_elements_text(coalesce(a.pending_content->'categorias','[]'::jsonb))),'{}'),
   imagen_url=nullif(a.pending_content->>'imagen_url',''),cover_alt=nullif(a.pending_content->>'cover_alt',''),serie=nullif(a.pending_content->>'serie',''),
   etiquetas=coalesce(array(select jsonb_array_elements_text(coalesce(a.pending_content->'etiquetas','[]'::jsonb))),'{}'),
   estado=next_state,publicado=(next_state='publicado'),fecha_publicacion=when_at,scheduled_at=case when next_state='programado' then when_at else null end,
   published_at=case when next_state='publicado' then now() else null end,pending_content=null,pending_fecha_publicacion=null,
   reviewer_id=null,review_started_at=null,updated_at=now() where id=p_id returning * into a;
 perform set_config('app.devocional_guard_bypass','off',true);
 insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion,nota)
 values(p_id,a.titulo,a.slug,auth.uid(),auth.jwt()->>'email',case when next_state='programado' then 'programado' else 'aprobado_publicado' end,case when next_state='programado' then 'Publicación programada para '||when_at::text else null end);
 perform public.devocional_queue_email(case when next_state='programado' then 'programado' else 'aprobado_publicado' end,a,null);
end $$;

create or replace function public.devocional_withdraw(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
 select * into a from public.devocionales where id=p_id for update;
 if not found then raise exception 'Devocional no encontrado.'; end if;
 if a.created_by=auth.uid() and public.has_admin_module_permission('devotionals','edit') and a.estado in ('pendiente_revision','cambios_solicitados') then
   perform set_config('app.devocional_guard_bypass','on',true);
   update public.devocionales set estado='borrador',reviewer_id=null,review_started_at=null,updated_at=now() where id=p_id returning * into a;
   perform set_config('app.devocional_guard_bypass','off',true);
 elsif a.reviewer_id=auth.uid() and a.estado='en_revision' and public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish') then
   perform set_config('app.devocional_guard_bypass','on',true);
   update public.devocionales set estado='pendiente_revision',reviewer_id=null,review_started_at=null,updated_at=now() where id=p_id returning * into a;
   perform set_config('app.devocional_guard_bypass','off',true);
 else raise exception 'No puedes retirar este devocional.' using errcode='42501'; end if;
 insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion) values(p_id,coalesce(a.pending_content->>'titulo',a.titulo),a.slug,auth.uid(),auth.jwt()->>'email','retirado');
end $$;
