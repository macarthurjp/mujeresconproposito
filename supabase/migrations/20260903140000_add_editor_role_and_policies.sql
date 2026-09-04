alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('crud', 'editor', 'read_export', 'read_only', 'revoked'));

alter table public.devocionales
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();

drop policy if exists "editors read own devocionales" on public.devocionales;
create policy "editors read own devocionales"
on public.devocionales for select to authenticated
using (public.current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editors insert own devocionales" on public.devocionales;
create policy "editors insert own devocionales"
on public.devocionales for insert to authenticated
with check (public.current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editors update own devocionales" on public.devocionales;
create policy "editors update own devocionales"
on public.devocionales for update to authenticated
using (public.current_user_role() = 'editor' and created_by = auth.uid())
with check (public.current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editors delete own devocionales" on public.devocionales;
create policy "editors delete own devocionales"
on public.devocionales for delete to authenticated
using (public.current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editors upload devotional images" on storage.objects;
create policy "editors upload devotional images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mcp930-images'
  and public.current_user_role() = 'editor'
  and (storage.foldername(name))[1] = 'devocionales'
);
