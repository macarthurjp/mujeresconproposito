-- Devotionals editorial workflow v2 (replaces Codex's undeployed 20261118100000
-- and 20261118110000). Additive: no column or table is dropped or renamed.
-- Rollback: supabase/rollbacks/20261119100000_devocional_editorial_v2.down.sql
--
-- Roles (decided 2026-11-19):
--   * Super Admin: may do everything directly (create, edit and publish any
--     article). May also send their own article to review to get a second view.
--   * Author (devotionals create/edit): works on a pending copy of their own
--     article, including edits to an already published one; the live version
--     stays online until the change is approved.
--   * Reviewer (devotionals view + publish): reviews OTHER people's articles.
--     Claims one, then requests changes (with a note) or approves/schedules
--     it. Reviewers never edit the author's text, so the author's voice is
--     kept: any change goes back to the author as a request.
--   * Authors get an email for every change made to their devotional by
--     someone else (outbox below, sent by Edge Function send-devotional-updates).
--
-- `estado` is the editorial state; `publicado` stays the "is live" flag.
-- An article can be live (publicado=true) while a pending edit sits in
-- borrador/pendiente_revision/en_revision/cambios_solicitados.

-- 1. Columns ---------------------------------------------------------------
alter table public.devocionales
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists review_started_at timestamptz,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists cover_alt text,
  add column if not exists oracion_html text;

alter table public.devocionales drop constraint if exists devocionales_estado_check;
alter table public.devocionales add constraint devocionales_estado_check
  check (estado in ('borrador','pendiente_revision','en_revision','cambios_solicitados','programado','publicado','eliminado'));

-- The current write guard blocks state changes from plain UPDATEs; this
-- backfill is a trusted data migration, so it uses the same bypass flag the
-- workflow functions use (transaction-local).
select set_config('app.devocional_guard_bypass','on',true);
-- Backfill. Old 'en_revision' meant "waiting in the queue" (nobody claimed it).
update public.devocionales set estado='pendiente_revision', submitted_at=coalesce(submitted_at, updated_at)
  where estado='en_revision' and reviewer_id is null;
-- Live articles without pending edits are 'publicado'.
update public.devocionales set estado='publicado', published_at=coalesce(published_at, fecha_publicacion, updated_at, now())
  where publicado=true and pending_content is null and estado='borrador';
select set_config('app.devocional_guard_bypass','off',true);

alter table public.devocional_historial drop constraint if exists devocional_historial_accion_check;
alter table public.devocional_historial add constraint devocional_historial_accion_check
  check (accion in ('creado','editado','enviado_a_revision','revision_tomada','revision_liberada','cambios_solicitados',
                    'retirado','aprobado_publicado','programado','publicado','despublicado','devuelto_a_borrador','eliminado'));

create index if not exists devocionales_review_queue_idx on public.devocionales (estado, submitted_at) where deleted_at is null;
create index if not exists devocionales_scheduled_idx on public.devocionales (scheduled_at) where estado='programado';

-- 2. Helpers ---------------------------------------------------------------
create or replace function public.devocional_can_review()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or (public.has_admin_module_permission('devotionals','view') and public.has_admin_module_permission('devotionals','publish'));
$$;
revoke all on function public.devocional_can_review() from public, anon;
grant execute on function public.devocional_can_review() to authenticated;

create or replace function public.devocional_can_author()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or public.has_admin_module_permission('devotionals','create')
      or public.has_admin_module_permission('devotionals','edit');
$$;
revoke all on function public.devocional_can_author() from public, anon;
grant execute on function public.devocional_can_author() to authenticated;

-- Applies pending_content to the live columns (used by approve). Internal only.
create or replace function public.devocional_apply_pending(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id;
  if a.pending_content is null then return; end if;
  update public.devocionales set
    titulo=a.pending_content->>'titulo',
    resumen=a.pending_content->>'resumen',
    contenido=a.pending_content->>'contenido',
    contenido_html=a.pending_content->>'contenido_html',
    introduccion_html=a.pending_content->>'introduccion_html',
    oracion_html=nullif(btrim(coalesce(a.pending_content->>'oracion_html','')),''),
    versiculo=a.pending_content->>'versiculo',
    categorias=coalesce(array(select jsonb_array_elements_text(coalesce(a.pending_content->'categorias','[]'::jsonb))),'{}'),
    autora=coalesce(nullif(a.pending_content->>'autora',''), a.autora),
    imagen_url=nullif(a.pending_content->>'imagen_url',''),
    -- Alt text defaults to the title so screen readers always get something.
    cover_alt=coalesce(nullif(btrim(coalesce(a.pending_content->>'cover_alt','')),''), a.pending_content->>'titulo'),
    pending_content=null,
    pending_fecha_publicacion=null
  where id=p_id;
end $$;
revoke all on function public.devocional_apply_pending(bigint) from public, anon, authenticated;

-- 3. Email outbox (private; written only by the functions below) ----------
create table if not exists public.devocional_email_outbox (
  id bigint generated by default as identity primary key,
  dedupe_key text not null unique,
  event_type text not null,
  devotional_id bigint,
  recipients text[] not null default '{}',
  payload jsonb not null default '{}',
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.devocional_email_outbox enable row level security;
revoke all on public.devocional_email_outbox from anon, authenticated;
grant all on public.devocional_email_outbox to service_role;
create index if not exists devocional_email_outbox_pending_idx on public.devocional_email_outbox (available_at) where sent_at is null;

-- Notifies the AUTHOR about a change made by someone else. "Sent to review"
-- keeps using the existing send-devotional-review-notification function.
create or replace function public.devocional_notify_author(p_event text, p_article public.devocionales, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare author_email text; title text;
begin
  if p_article.created_by is null or p_article.created_by = auth.uid() then return; end if;
  select u.email into author_email from auth.users u where u.id = p_article.created_by;
  if author_email is null then return; end if;
  title := coalesce(nullif(p_article.titulo,''), p_article.pending_content->>'titulo', 'Tu devocional');
  insert into public.devocional_email_outbox(dedupe_key, event_type, devotional_id, recipients, payload)
  values (p_event||':'||p_article.id||':'||clock_timestamp()::text, p_event, p_article.id, array[author_email],
    jsonb_build_object('titulo', title, 'slug', p_article.slug, 'nota', coalesce(p_note,''),
      'fecha', coalesce(p_article.scheduled_at, p_article.fecha_publicacion)))
  on conflict (dedupe_key) do nothing;
end $$;
revoke all on function public.devocional_notify_author(text, public.devocionales, text) from public, anon, authenticated;

-- 4. Direct-write guard ----------------------------------------------------
create or replace function public.devocionales_guard_direct_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare author_name text; allowed boolean;
begin
  if current_setting('app.devocional_guard_bypass', true) = 'on' then return new; end if;

  -- Super Admin writes directly, as in production today. Keep estado coherent
  -- with the live flag so lists and queues stay correct.
  if public.is_super_admin() then
    if new.publicado and new.pending_content is null and new.estado in ('borrador','programado') then
      new.estado := 'publicado';
      new.scheduled_at := null;
      new.published_at := coalesce(new.published_at, now());
    elsif not new.publicado and new.estado = 'publicado' then
      new.estado := 'borrador';
    end if;
    if new.imagen_url is not null and new.cover_alt is null then new.cover_alt := new.titulo; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid()
       or new.titulo is not null or new.resumen is not null or new.contenido is not null
       or new.introduccion_html is not null or new.contenido_html is not null or new.oracion_html is not null
       or new.versiculo is not null or coalesce(new.categorias,'{}') <> '{}'
       or new.imagen_url is not null or new.cover_alt is not null
       or new.publicado is true or new.fecha_publicacion is not null or new.estado <> 'borrador' then
      raise exception 'Los artículos nuevos deben crearse como borrador (pending_content).' using errcode='42501';
    end if;
    select nullif(btrim(r.nombre),'') into author_name from public.user_roles r
      where r.user_id = auth.uid() and not coalesce(r.is_revoked,false);
    new.autora := coalesce(author_name, nullif(split_part(auth.jwt()->>'email','@',1),''), 'Equipo Mujeres con Propósito');
    return new;
  end if;

  -- UPDATE: only the pending copy may change directly.
  if (to_jsonb(new) - array['pending_content','pending_fecha_publicacion','updated_at'])
     is distinct from (to_jsonb(old) - array['pending_content','pending_fecha_publicacion','updated_at']) then
    raise exception 'Usa las acciones del flujo editorial para cambiar el estado o la versión publicada.' using errcode='42501';
  end if;
  -- Only the author, on their draft / returned article / live article
  -- (proposing an edit). Reviewers request changes instead of editing.
  allowed := old.created_by = auth.uid() and old.estado in ('borrador','cambios_solicitados','publicado')
    and public.has_admin_module_permission('devotionals','edit');
  if not allowed then
    raise exception 'El artículo está bloqueado mientras está en revisión o programado.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.devocionales_guard_direct_writes() from public, anon, authenticated;
drop trigger if exists devocionales_guard_direct_writes on public.devocionales;
create trigger devocionales_guard_direct_writes before insert or update on public.devocionales
  for each row execute function public.devocionales_guard_direct_writes();

-- 5. Policies --------------------------------------------------------------
drop policy if exists "roles read devocionales" on public.devocionales;
create policy "roles read devocionales" on public.devocionales for select to authenticated
using (
  public.is_super_admin()
  -- published articles are public on the site; signed-in visitors read them too
  or publicado = true
  or (public.has_admin_module_permission('devotionals','view') and created_by = auth.uid())
  or (public.devocional_can_review() and created_by <> auth.uid()
      and estado in ('pendiente_revision','en_revision','cambios_solicitados'))
);
drop policy if exists "roles update devocionales" on public.devocionales;
create policy "roles update devocionales" on public.devocionales for update to authenticated
using (
  public.is_super_admin()
  or (public.has_admin_module_permission('devotionals','edit') and created_by = auth.uid())
)
with check (
  public.is_super_admin()
  or (public.has_admin_module_permission('devotionals','edit') and created_by = auth.uid())
);
-- insert / delete policies are unchanged.

-- 6. Workflow actions ------------------------------------------------------
create or replace function public.devocional_submit_for_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.created_by is distinct from auth.uid() or not public.devocional_can_author() then
    raise exception 'Solo la autora puede enviar su devocional a revisión.' using errcode='42501'; end if;
  if a.estado not in ('borrador','cambios_solicitados','publicado') then
    raise exception 'Este devocional ya está en revisión o programado.'; end if;
  if a.pending_content is null or coalesce(btrim(a.pending_content->>'titulo'),'')='' or coalesce(btrim(a.pending_content->>'contenido'),'')='' then
    raise exception 'Completa al menos el título y la reflexión antes de enviar a revisión.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='pendiente_revision', submitted_at=now(), reviewer_id=null, review_started_at=null, updated_at=now()
    where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, a.pending_content->>'titulo', a.slug, auth.uid(), auth.jwt()->>'email', 'enviado_a_revision');
end $$;

create or replace function public.devocional_claim_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.created_by = auth.uid() then raise exception 'No puedes revisar tu propio devocional.' using errcode='42501'; end if;
  if not public.devocional_can_review() then raise exception 'No tienes permiso para revisar devocionales.' using errcode='42501'; end if;
  if a.estado <> 'pendiente_revision' then raise exception 'Este devocional ya fue tomado o no está pendiente.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='en_revision', reviewer_id=auth.uid(), review_started_at=now(), updated_at=now()
    where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, a.pending_content->>'titulo', a.slug, auth.uid(), auth.jwt()->>'email', 'revision_tomada');
  perform public.devocional_notify_author('revision_tomada', a, null);
end $$;

create or replace function public.devocional_release_review(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.estado <> 'en_revision' or not (a.reviewer_id = auth.uid() or public.is_super_admin()) then
    raise exception 'Solo la revisora asignada puede liberar esta revisión.' using errcode='42501'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='pendiente_revision', reviewer_id=null, review_started_at=null, updated_at=now()
    where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, a.pending_content->>'titulo', a.slug, auth.uid(), auth.jwt()->>'email', 'revision_liberada');
end $$;

create or replace function public.devocional_request_changes(p_id bigint, p_nota text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype; n text := btrim(coalesce(p_nota,''));
begin
  if n = '' then raise exception 'Escribe una nota explicando los cambios solicitados.'; end if;
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not (public.is_super_admin() and a.estado in ('pendiente_revision','en_revision'))
     and not (a.estado = 'en_revision' and a.reviewer_id = auth.uid() and a.created_by <> auth.uid() and public.devocional_can_review()) then
    raise exception 'Solo la revisora asignada puede solicitar cambios.' using errcode='42501'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='cambios_solicitados', reviewer_id=null, review_started_at=null, updated_at=now()
    where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion,nota)
    values(p_id, a.pending_content->>'titulo', a.slug, auth.uid(), auth.jwt()->>'email', 'cambios_solicitados', n);
  perform public.devocional_notify_author('cambios_solicitados', a, n);
end $$;

-- Reviewers approve the article they claimed. Super Admin may publish any
-- article directly from any editorial state (their "do everything" path).
create or replace function public.devocional_approve_and_publish(p_id bigint, p_fecha timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype; when_at timestamptz; next_state text; was_live boolean;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.estado = 'eliminado' then raise exception 'Este devocional está eliminado.'; end if;
  if not public.is_super_admin() then
    if a.created_by = auth.uid() then raise exception 'No puedes aprobar tu propio devocional.' using errcode='42501'; end if;
    if not public.devocional_can_review() then raise exception 'No tienes permiso para aprobar.' using errcode='42501'; end if;
    if a.estado <> 'en_revision' or a.reviewer_id is distinct from auth.uid() then raise exception 'Toma la revisión antes de aprobar.'; end if;
  end if;
  if a.pending_content is null and a.publicado then raise exception 'No hay cambios pendientes para aprobar.'; end if;
  was_live := a.publicado;
  when_at := coalesce(p_fecha, a.pending_fecha_publicacion, now());
  -- A live article keeps its original date; its approved edit goes live now.
  next_state := case when not was_live and when_at > now() then 'programado' else 'publicado' end;
  perform set_config('app.devocional_guard_bypass','on',true);
  perform public.devocional_apply_pending(p_id);
  update public.devocionales set
    estado = next_state,
    publicado = (next_state = 'publicado'),
    fecha_publicacion = case when was_live then fecha_publicacion else when_at end,
    scheduled_at = case when next_state = 'programado' then when_at else null end,
    published_at = case when next_state = 'publicado' then coalesce(published_at, now()) else null end,
    reviewer_id = null, review_started_at = null, updated_at = now()
  where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion,nota)
    values(p_id, a.titulo, a.slug, auth.uid(), auth.jwt()->>'email',
      case when next_state='programado' then 'programado' else 'aprobado_publicado' end,
      case when next_state='programado' then 'Publicación programada para '||to_char(when_at at time zone 'Europe/Luxembourg','DD/MM/YYYY HH24:MI') else null end);
  perform public.devocional_notify_author(case when next_state='programado' then 'programado' else 'aprobado_publicado' end, a, null);
end $$;

create or replace function public.devocional_withdraw(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.created_by = auth.uid() and public.devocional_can_author() and a.estado in ('pendiente_revision','cambios_solicitados') then
    perform set_config('app.devocional_guard_bypass','on',true);
    update public.devocionales set estado = case when a.publicado then 'publicado' else 'borrador' end,
      reviewer_id=null, review_started_at=null, updated_at=now() where id=p_id returning * into a;
    perform set_config('app.devocional_guard_bypass','off',true);
  elsif a.reviewer_id = auth.uid() and a.estado = 'en_revision' then
    perform public.devocional_release_review(p_id);
    return;
  else
    raise exception 'No puedes retirar este devocional.' using errcode='42501';
  end if;
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, coalesce(a.pending_content->>'titulo', a.titulo), a.slug, auth.uid(), auth.jwt()->>'email', 'retirado');
end $$;

-- Existing production action (Super Admin): take a live article offline.
create or replace function public.devocional_unpublish(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if not public.is_super_admin() then raise exception 'Solo el Super Admin puede retirar un devocional publicado.' using errcode='42501'; end if;
  if not a.publicado and a.estado <> 'programado' then raise exception 'Este devocional no está publicado ni programado.'; end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set publicado=false, fecha_publicacion=null, scheduled_at=null, published_at=null,
    estado = case when a.estado in ('publicado','programado') then 'borrador' else a.estado end, updated_at=now()
    where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, a.titulo, a.slug, auth.uid(), auth.jwt()->>'email', 'despublicado');
  perform public.devocional_notify_author('despublicado', a, null);
end $$;

create or replace function public.devocional_soft_delete(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype;
begin
  select * into a from public.devocionales where id=p_id for update;
  if not found then raise exception 'Devocional no encontrado.'; end if;
  if a.estado = 'eliminado' then return; end if;
  if not public.is_super_admin() then
    if a.publicado or a.estado in ('programado','en_revision','pendiente_revision') then
      raise exception 'Solo el Super Admin puede eliminar un devocional publicado o en revisión.' using errcode='42501'; end if;
    if a.created_by is distinct from auth.uid() or not public.has_admin_module_permission('devotionals','delete') then
      raise exception 'No tienes permiso para eliminar este borrador.' using errcode='42501'; end if;
  end if;
  perform set_config('app.devocional_guard_bypass','on',true);
  update public.devocionales set estado='eliminado', publicado=false, fecha_publicacion=null, scheduled_at=null,
    deleted_at=now(), reviewer_id=null, review_started_at=null, updated_at=now() where id=p_id returning * into a;
  perform set_config('app.devocional_guard_bypass','off',true);
  insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,actor_id,actor_email,accion)
    values(p_id, coalesce(a.titulo, a.pending_content->>'titulo'), a.slug, auth.uid(), auth.jwt()->>'email', 'eliminado');
  perform public.devocional_notify_author('eliminado', a, null);
end $$;

-- Scheduled publication (pg_cron, every minute).
create or replace function public.devocional_publish_due()
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.devocionales%rowtype; n integer := 0;
begin
  for a in select * from public.devocionales where estado='programado' and scheduled_at <= now() and deleted_at is null for update skip locked loop
    perform set_config('app.devocional_guard_bypass','on',true);
    update public.devocionales set estado='publicado', publicado=true, fecha_publicacion=scheduled_at, published_at=now(), scheduled_at=null, updated_at=now()
      where id=a.id returning * into a;
    perform set_config('app.devocional_guard_bypass','off',true);
    insert into public.devocional_historial(devocional_id,devocional_titulo,devocional_slug,accion,nota)
      values(a.id, a.titulo, a.slug, 'publicado', 'Publicación automática por horario');
    perform public.devocional_notify_author('publicado', a, null);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.devocional_submit_for_review(bigint), public.devocional_claim_review(bigint),
  public.devocional_release_review(bigint), public.devocional_request_changes(bigint,text),
  public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint),
  public.devocional_unpublish(bigint), public.devocional_soft_delete(bigint), public.devocional_publish_due() from public, anon;
grant execute on function public.devocional_submit_for_review(bigint), public.devocional_claim_review(bigint),
  public.devocional_release_review(bigint), public.devocional_request_changes(bigint,text),
  public.devocional_approve_and_publish(bigint,timestamptz), public.devocional_withdraw(bigint),
  public.devocional_unpublish(bigint), public.devocional_soft_delete(bigint) to authenticated;
revoke all on function public.devocional_publish_due() from authenticated;
grant execute on function public.devocional_publish_due() to service_role;

-- 7. Jobs ------------------------------------------------------------------
-- Both jobs are safe on a local stack: the email job only calls out when the
-- Vault holds 'devotional_updates_url' and 'devotional_cron_secret', which
-- exist only in production (created at deploy time).
create extension if not exists pg_cron with schema pg_catalog;
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname in ('mcp930-devocional-publish-due','mcp930-devocional-updates-email') loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('mcp930-devocional-publish-due', '* * * * *', 'select public.devocional_publish_due();');
  perform cron.schedule('mcp930-devocional-updates-email', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='devotional_updates_url' limit 1),
      headers := jsonb_build_object('Content-Type','application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='devotional_cron_secret' limit 1)),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 30000)
    where exists (select 1 from public.devocional_email_outbox where sent_at is null and attempts < 5 and available_at <= now())
      and exists (select 1 from vault.decrypted_secrets where name='devotional_updates_url');
  $job$);
end $$;
