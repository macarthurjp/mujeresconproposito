-- Sent notices can be removed from the admin history by whoever can send them.
-- (A notification already delivered to phones cannot be recalled; this only
-- cleans the history list.)
drop policy if exists "roles delete broadcasts" on public.push_broadcasts;
create policy "roles delete broadcasts" on public.push_broadcasts
  for delete to authenticated
  using (public.has_admin_module_permission('notices', 'send'));
grant delete on public.push_broadcasts to authenticated;
