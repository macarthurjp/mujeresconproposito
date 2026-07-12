-- New Supabase publishable keys can reach PostgREST without a legacy JWT role.
-- Limit this broad API access to INSERT only; SELECT remains authenticated-only.
drop policy if exists "public insert unirse" on public.unirse;
create policy "public insert unirse"
on public.unirse
for insert
to public
with check (true);

grant insert on table public.unirse to anon, authenticated;
