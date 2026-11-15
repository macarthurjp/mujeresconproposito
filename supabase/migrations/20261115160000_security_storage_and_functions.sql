-- Security audit 2026-11-15.
--
-- 1. Storage bucket "mcp930-images": legacy policies let ANYONE (even without
--    an account) upload and overwrite images, and any signed-in account
--    delete them. Uploads only come from the admin panels, so keep only the
--    Super Admin and editorial policies (plus public read).
drop policy if exists "Public upload destacadas" on storage.objects;
drop policy if exists "Public update destacadas" on storage.objects;
drop policy if exists "Public read destacadas" on storage.objects;
drop policy if exists "Authenticated upload mcp930 images" on storage.objects;
drop policy if exists "Authenticated update mcp930 images" on storage.objects;
drop policy if exists "Authenticated delete mcp930 images" on storage.objects;
drop policy if exists "Public read mcp930 images" on storage.objects;
-- Remaining: "public read mcp930 images", "super admin upload/update/delete
-- mcp930 images", "editorial upload devotional images".

-- 2. Trigger / internal functions must not be callable through the API.
revoke all on function public.assign_default_user_role() from public, anon, authenticated;
revoke all on function public.devocionales_guard_direct_writes() from public, anon, authenticated;
revoke all on function public.devocionales_log_activity() from public, anon, authenticated;
revoke all on function public.devocionales_log_delete() from public, anon, authenticated;
revoke all on function public.prevent_duplicate_unirse() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- 3. Role helpers are for signed-in users only.
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
