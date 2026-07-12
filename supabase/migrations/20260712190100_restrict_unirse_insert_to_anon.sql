-- Keep public form writes limited to unauthenticated website visitors.
drop policy if exists "public insert unirse" on public.unirse;
create policy "public insert unirse"
on public.unirse
for insert
to anon
with check (true);

revoke insert on table public.unirse from authenticated;
grant insert on table public.unirse to anon;
