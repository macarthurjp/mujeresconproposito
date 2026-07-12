-- Allow the public website form to create registrations while keeping reads private.
alter table public.unirse enable row level security;

grant insert on table public.unirse to anon;
grant select on table public.unirse to authenticated;

drop policy if exists "public insert unirse" on public.unirse;
create policy "public insert unirse"
on public.unirse
for insert
to anon
with check (true);

drop policy if exists "authenticated read unirse" on public.unirse;
create policy "authenticated read unirse"
on public.unirse
for select
to authenticated
using (true);
